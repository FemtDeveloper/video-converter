
# Subtítulos automáticos tipo Instagram (hardsub) en tu servicio NestJS (Docker)

> **Objetivo**: partir de un video que ya llega a tu API, detectar el audio, transcribir en español de forma _offline_ y **quemar** subtítulos con estilo (fuente, color, posición) para obtener un MP4 final.  
> **Criterio**: priorizar **bajo consumo de recursos** y dejar “puertas abiertas” para mejorar precisión/velocidad más adelante sin cambiar demasiado la arquitectura.

---

## 0) Decisiones rápidas (según escasez de recursos)

- **Ruta más ligera (CPU-only)** → **Vosk (ES)** para ASR + **ASS + FFmpeg** para estilo/quemado.  
  - Pros: muy barato en CPU/RAM, arranca rápido, modelos ~50–80 MB.  
  - Contras: precisión menor que Whisper en audios difíciles.

- **Ruta equilibrada (mejor accuracy, aún CPU-friendly)** → **faster-whisper** (modelo `small` o `base`, INT8) + **ASS + FFmpeg**.  
  - Pros: precisión alta y velocidad decente en CPU moderna, configurable.  
  - Contras: binarios/weights más pesados (~150–500 MB) y algo más de RAM.

> **Recomendación inicial**: desplegar **ambas** rutas y activar una por `ENV` (`ASR_BACKEND=vosk|whisper`) para evaluar *accuracy vs. costo* con tus propios videos.

---

## 1) Estructura del pipeline

1. **Extraer audio** del MP4 a WAV mono 16 kHz (si el backend ASR lo requiere).
2. **Transcribir** (Vosk o faster-whisper) → obtener segmentos con `start/end/text`.
3. **Generar subtítulos**:
   - *Opción A*: crear `.ass` con **estilo por defecto** (editable).
   - *Opción B*: crear `.srt` y aplicar `force_style` en FFmpeg (menos flexible).
4. **Quemar subtítulos** con **FFmpeg + libass** → `output.mp4` final.
5. **Limpiar temporales** y devolver/almacenar el resultado.

---

## 2) Cambios mínimos en tu imagen Docker

### 2.1 Dockerfile base (Node 18 slim + FFmpeg + Python opcional)
```Dockerfile
FROM node:18-slim

# 1) Paquetes del sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg python3 python3-pip ca-certificates unzip curl fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

# 2) (OPCIONAL) Whisper vía faster-whisper
#   - Si solo usarás Vosk, puedes comentar esta línea para ahorrar tamaño
RUN pip3 install --no-cache-dir faster-whisper==1.0.3

# 3) App
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build

# 4) (OPCIONAL) Modelo Vosk ES "small"
#    Puedes montar como volumen en lugar de hornearlo en la imagen
RUN mkdir -p /models/vosk \
 && curl -L -o /models/vosk/es.zip "https://alphacephei.com/vosk/models/vosk-model-small-es-0.42.zip" \
 && unzip /models/vosk/es.zip -d /models/vosk \
 && rm /models/vosk/es.zip

ENV VOSK_MODEL_PATH="/models/vosk/vosk-model-small-es-0.42"
ENV ASR_BACKEND="vosk"     # "vosk" | "whisper"
ENV WHISPER_MODEL="small"  # "tiny"|"base"|"small"|"medium"
ENV SUBS_STYLE="instagram" # selector de estilos
ENV TZ="America/Bogota"

EXPOSE 4100
CMD ["node", "dist/main.js"]
```

> **Tip**: si prefieres no instalar Python, usa solo **Vosk (Node)** y comenta la línea `pip3 install faster-whisper`.

### 2.2 docker-compose (recursos locales razonables)
```yaml
services:
  api:
    build: .
    image: tu/api-subtitles:dev
    environment:
      - NODE_ENV=production
      - ASR_BACKEND=${ASR_BACKEND:-vosk}
      - WHISPER_MODEL=${WHISPER_MODEL:-small}
      - VOSK_MODEL_PATH=/models/vosk/vosk-model-small-es-0.42
    ports:
      - "4100:4100"
    # Límites sugeridos en local (ajusta si ves throttling)
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: "2G"
        reservations:
          cpus: "1.0"
          memory: "1G"
    volumes:
      - ./tmp:/tmp/work   # outputs/temporales
      # - /host/modelos/vosk:/models/vosk   # alternativa si no los horneas
```

---

## 3) Código: servicios reutilizables

### 3.1 Extracción de audio (Node)
```ts
import { spawn } from 'node:child_process';

export async function extractAudio(inputMp4: string, outWav: string): Promise<void> {
  const args = ['-y', '-i', inputMp4, '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1', outWav];
  await spawnPromise('ffmpeg', args);
}

function spawnPromise(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)));
  });
}
```

### 3.2 ASR con **Vosk (Node)**
```ts
import * as fs from 'node:fs';
import * as vosk from 'vosk';

export async function transcribeWithVosk(wavPath: string, modelPath = process.env.VOSK_MODEL_PATH) {
  vosk.setLogLevel(0);
  const model = new vosk.Model(modelPath!);
  const rec = new vosk.Recognizer({ model, sampleRate: 16000 });
  const pcm = fs.readFileSync(wavPath);
  rec.acceptWaveform(pcm);
  const result = rec.finalResult(); // { text: "..." , result: [{word, start, end}, ...] }
  rec.free(); model.free();
  // Mapear a segmentos simples (a falta de puntuación)
  return [{ start: 0, end: 0, text: result.text.trim() }];
}
```

### 3.3 ASR con **faster-whisper (Python vía CLI)**
```ts
import { spawn } from 'node:child_process';

export async function transcribeWithWhisper(inputMedia: string, model = process.env.WHISPER_MODEL || 'small') {
  // Requiere `pip install faster-whisper` en la imagen
  // Usamos un script simple de Python que emite SRT a stdout o archivo
  const args = ['-m', 'faster_whisper.cli', inputMedia, '--model', model, '--language', 'es', '--srt', '--output_dir', '/tmp/work'];
  await spawnPromise('python3', args);
  // Resultado esperado: /tmp/work/<basename>.srt
}
```

---

## 4) Generación de subtítulos y estilo

### 4.1 Plantilla **ASS** (estilo “instagram” por defecto)
Guarda como `assets/styles/instagram.ass` (ajústalo a tu gusto):

```ini
[Script Info]
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default, Inter, 48, &H00FFFFFF, &H000000FF, &H80000000, &H80000000, 0, 0, 0, 0, 100, 100, 0, 0, 3, 8, 0, 2, 30, 30, 60, 1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
; Las líneas Dialogue se añadirán programáticamente
```

- **Fontname**: `Inter` (trae buena legibilidad; puedes cambiar a `Impact` o tu tipografía).  
- **PrimaryColour**: blanco (`&H00FFFFFF`).  
- **Back/OutlineColour**: negro semitransparente (`&H80000000`).  
- **BorderStyle=3** → caja de fondo.  
- **Alignment=2** → centrado abajo; `MarginV=60` y márgenes laterales 30.

### 4.2 Insertar eventos ASS desde Node
```ts
import * as fs from 'node:fs';

export function writeAssFromSegments(templatePath: string, segments: {start:number,end:number,text:string}[], outPath: string) {
  const tpl = fs.readFileSync(templatePath, 'utf8');
  const head = tpl.split('[Events]')[0] + '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
  const body = segments.map(s => {
    const ss = toAssTime(s.start);
    const ee = toAssTime(s.end || s.start + Math.max(2, Math.min(5, s.text.split(' ').length / 2)));
    const safe = s.text.replace(/\r?\n/g, ' ').replace(/{/g,'(').replace(/}/g,')');
    return `Dialogue: 0,${ss},${ee},Default,,0,0,60,,${safe}`;
  }).join('\n');
  fs.writeFileSync(outPath, head + body + '\n', 'utf8');
}

function toAssTime(sec: number) {
  const h = Math.floor(sec/3600);
  const m = Math.floor((sec%3600)/60);
  const s = (sec%60);
  return `${h}:${m.toString().padStart(2,'0')}:${s.toFixed(2).padStart(5,'0')}`;
}
```

> Nota: si el backend devuelve tiempos por **palabra**, puedes agrupar en frases de 2–5 s para no sobrecargar visualmente. Si no hay tiempos (Vosk simplificado), genera duraciones heurísticas como arriba.

---

## 5) Quemado con FFmpeg (hardsub)

### 5.1 Con archivo `.ass`
```bash
ffmpeg -y -i input.mp4 -vf "ass=/tmp/work/subs.ass" -c:v libx264 -preset veryfast -crf 20 -c:a copy /tmp/work/out.mp4
```

### 5.2 Con `.srt` + `force_style` (si no usas ASS)
```bash
ffmpeg -y -i input.mp4 -vf "subtitles=/tmp/work/subs.srt:force_style='Fontname=Inter,PrimaryColour=&H00FFFFFF,BorderStyle=3,OutlineColour=&H80000000,BackColour=&H80000000,Alignment=2,MarginV=60,Fontsize=48'" -c:v libx264 -preset veryfast -crf 20 -c:a copy /tmp/work/out.mp4
```

---

## 6) Endpoint sugerido (NestJS)

- **POST** `/api/v1/captionize` (`multipart/form-data`) con `video`.
- Pipeline interno:
  1. Guardar en `/tmp/work/<jobId>/in.mp4`.
  2. Extraer audio si `ASR_BACKEND=vosk` → `audio.wav`.
  3. Transcribir (Vosk o Whisper) → `segments`.
  4. Generar `subs.ass` con estilo por defecto (o `subs.srt`).
  5. FFmpeg hardsub → `out.mp4`.
  6. Stream de `out.mp4` al cliente y _cleanup_.

> **Puerta a futuro**: exponer `?style=instagram|clean|bold` y `.env` para cambiar tipografía/colores sin redeploy.

---

## 7) Requisitos de recursos (local, punto de partida)

| Componente | CPU | RAM aprox. | Disco | Comentarios |
|---|---:|---:|---:|---|
| **Vosk (ES small)** | 1 vCPU | 200–400 MB | 60–100 MB | Muy estable en CPU. Buen *throughput* ~1× RT (o mejor). |
| **faster-whisper (base/small, INT8 CPU)** | 2 vCPU | 1.5–3 GB | 150–500 MB | Mejor accuracy que Vosk; 0.5–1.5× RT según CPU. |
| **FFmpeg (hardsub x264)** | 1–2 vCPU | 200–400 MB | — | `-preset veryfast` para balancear calidad/tiempo. |
| **Total (ruta Vosk)** | **2 vCPU** | **≤1 GB** | **~200 MB** | Recomendación mínima para pruebas. |
| **Total (ruta Whisper)** | **3–4 vCPU** | **2–4 GB** | **~700 MB** | Mejor precisión, mayor costo. |

> **RT** = tiempo real. Si un video dura 60 s, 1× RT ≈ procesa en ~60 s.

---

## 8) Flags y *knobs* para optimizar

- **FFmpeg**: usa `-preset veryfast/ultrafast` y ajusta `-crf 20–24` (más grande = menor tamaño/más rápido).  
- **Vosk**: prueba `vosk-model-small-es` (rápido). Si el audio es claro y cercano, dará buen resultado.  
- **Whisper**: emplea `--compute_type int8` (si usas wrappers que lo soporten) y modelos `base/small`.  
- **Batch**: procesa trabajos en **colas** (BullMQ) para no bloquear requests y aprovechar múltiplos vCPU.  
- **Cache** (opcional): si vas a subtitular el mismo video varias veces, cachea `out.mp4` por hash de contenido.

---

## 9) Errores comunes y cómo evitarlos

- **Fuentes**: si cambias `Fontname` en ASS, asegúrate de que la fuente esté disponible en el contenedor (instálala o usa una estándar como `DejaVu Sans`/`Inter`).  
- **Libass**: algunas builds mínimas de FFmpeg no traen libass; valida con `ffmpeg -filters | grep -E "subtitles|ass"`.  
- **Tiempos**: respeta formatos (`h:mm:ss.cc` en ASS, `hh:mm:ss,ms` en SRT).  
- **Caracteres especiales**: escapa `{}` en ASS (usa paréntesis) y evita saltos de línea excesivos.

---

## 10) Checklist de *Quick Start* (local)

1. `docker compose build && docker compose up`  
2. `POST /api/v1/captionize` con `video=archivo.mp4`  
3. Verifica salida en `/tmp/work/<jobId>/out.mp4`  
4. Ajusta estilo en `assets/styles/instagram.ass` (fuente, colores, `MarginV`, tamaño)  
5. Cambia `ASR_BACKEND=whisper` si quieres comparar precisión

---

## 11) Roadmap corto (sin romper nada)

- **Alineación por palabra** (opcional): integrar WhisperX para karaoke/colores por palabra.  
- **Plantillas de estilo**: `instagram`, `clean`, `outline`, seleccionables por query param.  
- **S3/Backblaze**: mover outputs a almacenamiento de objetos con URLs firmadas.  
- **Métrica de calidad**: registrar WER aproximada post-edición manual (si aplica).

---

## 12) Licencias y notas

- Vosk y faster-whisper son OSS. Revisa licencias de **modelos** y **fuentes** que incluyas.  
- Evita subir datos sensibles si haces *debug logs* con transcripciones.

---

**Fin.** Cualquier ajuste de estilo (tipografía, colores, posición) se realiza en el `.ass` de plantilla o con `force_style` sin tocar el pipeline.
