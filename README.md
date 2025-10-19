# Video Converter API

API NestJS que convierte imagenes en videos verticales y puede generar subtitulos hardsub directamente sobre el resultado. Incluye autenticacion por API key, registro de trabajos y despliegue empaquetado con Docker.

---

## Contenido

- [Caracteristicas](#caracteristicas)
- [Requisitos](#requisitos)
- [Variables de entorno](#variables-de-entorno)
- [Paso a paso: entorno local (Windows / Linux)](#paso-a-paso-entorno-local-windows--linux)
- [Paso a paso: despliegue en digitalocean](#paso-a-paso-despliegue-en-digitalocean)
- [Migraciones y datos iniciales](#migraciones-y-datos-iniciales)
- [Pruebas de las APIs](#pruebas-de-las-apis)
- [Comandos npm utiles](#comandos-npm-utiles)
- [Notas adicionales](#notas-adicionales)

---

## Caracteristicas

- Convierte imagenes JPG/PNG/WebP en videos MP4 verticales 1080x1920.
- Permite agregar un caption estatico con `drawtext` (texto, colores y tamano configurables).
- Endpoint `captionize` que transcribe el audio del video y quema subtitulos ASS (Vosk o backend mock).
- Persistencia con PostgreSQL mediante Prisma y registro de cada trabajo en la tabla `Job`.
- Rate limiting apoyado en Redis y documentacion Swagger protegida por API key.

---

## Requisitos

| Entorno | Herramientas |
| --- | --- |
| Local (Windows / Linux) | Docker Engine 24+, Docker Compose v2, Git, curl/unzip. Opcional Node.js 20+ si se ejecutan scripts fuera del contenedor. |
| Produccion (Droplet DO) | Ubuntu 22.04 LTS, Docker Engine + Compose plugin, usuario con sudo, puertos 22/4100 abiertos. |
| Transcripcion real | Modelo Vosk ES descomprimido y montado en `./models/vosk` (o ruta equivalente). |

---

## Variables de entorno

Crea un archivo `.env` en la raiz del proyecto con estos valores (ajusta los que necesites):

```dotenv
# Aplicacion
APP_NAME=video-converter
APP_PORT=4100
NODE_ENV=development
API_KEY_HEADER=x-api-key
LOG_LEVEL=info

# Limites
MAX_IMAGE_UPLOAD_MB=5
MAX_VIDEO_UPLOAD_MB=200
MAX_VIDEO_DURATION_SECONDS=70
RATE_LIMIT_WINDOW_SECONDS=3600
RATE_LIMIT_MAX_REQUESTS=60
RATE_LIMIT_BURST_CAP=5

# Rutas de almacenamiento
TEMP_STORAGE_PATH=/app/tmp/jobs
OUTPUT_STORAGE_PATH=/app/data/outputs

# Infraestructura (dentro del contenedor)
DATABASE_URL=postgresql://videoconverter:videoconverter@postgres:5432/video_converter?schema=public
REDIS_URL=redis://redis:6379

# Seeds
INITIAL_API_KEY=cambia-esta-clave-super-segura

# Motor de subtitulos
ASR_BACKEND=vosk
VOSK_MODEL_PATH=/models/vosk/vosk-model-small-es-0.42
WHISPER_MODEL=small
SUBS_STYLE=instagram
CAPTION_FONT_FILE=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
```

Notas:

- Para ejecutar comandos Prisma desde tu maquina (fuera de Docker) exporta `DATABASE_URL=postgresql://videoconverter:videoconverter@localhost:15432/video_converter?schema=public` justo antes del comando. Dentro del contenedor debe permanecer `postgres:5432`.
- Si aun no tienes el modelo Vosk, puedes fijar `ASR_BACKEND=mock` de forma temporal. Vuelve a `vosk` despues de descargar el modelo y montar la carpeta.
- `CAPTION_FONT_FILE` permite elegir la fuente usada en el caption estatico; si lo dejas vacio, FFmpeg utilizara la fuente por defecto.

---

## Paso a paso: entorno local (Windows / Linux)

Sigue estos pasos en orden; estan escritos pensando en alguien sin experiencia previa.

### 0. Comprobar requisitos

```bash
docker --version
docker compose version
```

Si alguno falla, instala Docker Desktop (Windows) o Docker Engine + Compose (Linux) antes de continuar.

### 1. Descargar el proyecto

```bash
git clone https://github.com/tu-organizacion/video-converter.git
cd video-converter
```

Si prefieres no usar Git, descarga el ZIP desde GitHub y extraelo dentro de `C:\Users\<tu_usuario>\Desktop\projects\video-converter`.

### 2. Crear carpetas para datos y modelos

- **PowerShell (Windows):**
  ```powershell
  New-Item -ItemType Directory -Force -Path data\outputs, tmp\jobs, models\vosk | Out-Null
  ```
- **Bash (Linux/macOS):**
  ```bash
  mkdir -p data/outputs tmp/jobs models/vosk
  ```

### 3. Descargar el modelo Vosk

Opcion rapida usando curl/unzip:

- **PowerShell:**
  ```powershell
  curl -L -o models/vosk/es.zip https://alphacephei.com/vosk/models/vosk-model-small-es-0.42.zip
  tar -xf models/vosk/es.zip -C models/vosk
  Remove-Item models/vosk/es.zip
  ```
- **Bash:**
  ```bash
  curl -L -o models/vosk/es.zip https://alphacephei.com/vosk/models/vosk-model-small-es-0.42.zip
  unzip models/vosk/es.zip -d models/vosk
  rm models/vosk/es.zip
  ```

Opcion manual: descarga el ZIP con tu navegador, crea `models/vosk` y extrae todo ahi hasta obtener `models/vosk/vosk-model-small-es-0.42`.

### 4. Crear el archivo `.env`

1. Copia el bloque de variables anterior.
2. Guarda el archivo como `.env` en la raiz del repositorio.
3. Comprueba que `ASR_BACKEND=vosk` y `VOSK_MODEL_PATH=/models/vosk/vosk-model-small-es-0.42`.

### 5. Construir y levantar los contenedores

```bash
docker compose up -d --build
```

Este comando descarga las imagenes necesarias y arranca:
- `video-converter-app-1`
- `video-converter-postgres-1` (mapeado a `localhost:15432`)
- `video-converter-redis-1` (mapeado a `localhost:6380`)

### 6. Verificar que todo este en marcha

```bash
docker compose ps
```

Los tres servicios deben aparecer con `STATUS` igual a `Up`. Si `app` entra en `Restarting`, revisa `docker compose logs app` (el caso mas comun es que la carpeta del modelo Vosk no exista o que el `.env` tenga credenciales incorrectas).

### 7. Ejecutar migraciones de Prisma

```bash
docker compose run --rm app npx prisma migrate deploy
```

Crea las tablas necesarias en PostgreSQL. Debes repetirlo cada vez que cambie `prisma/schema.prisma`.

### 8. Instalar dependencias locales y sembrar datos iniciales

1. `npm install` (solo la primera vez) para obtener `ts-node`.
2. Ejecuta el seed usando la base publicada en `localhost:15432`.

- **PowerShell:**
  ```powershell
  npm install
  $env:DATABASE_URL="postgresql://videoconverter:videoconverter@localhost:15432/video_converter?schema=public"
  npm run prisma:seed
  Remove-Item Env:DATABASE_URL
  ```
- **Bash:**
  ```bash
  npm install
  DATABASE_URL="postgresql://videoconverter:videoconverter@localhost:15432/video_converter?schema=public" npm run prisma:seed
  ```

El seed crea la organizacion `beta` y la API key definida en `INITIAL_API_KEY`.

### 9. Probar la API con Postman

1. Crea un entorno en Postman con `baseUrl = http://localhost:4100` y `apiKey = <tu API key>`.
2. Lanza `GET {{baseUrl}}/health`. Debes recibir `status: ok`.
3. Prueba `POST {{baseUrl}}/api/v1/video-from-image` y `POST {{baseUrl}}/api/v1/captionize` siguiendo la seccion [Pruebas de las APIs](#pruebas-de-las-apis).
4. Comprueba que la cabecera `X-Transcript-Backend` devuelva `vosk` (si aparece `mock` no se monto el modelo correctamente).

### 10. Ubicacion de los resultados

- Videos y subtitulos: `data/outputs/`
- Temporales: `tmp/jobs/` (el servicio los elimina al finalizar cada trabajo)

Para detener todo:
```bash
docker compose down
```

---

## Paso a paso: despliegue en DigitalOcean

### 0. Crear el droplet

- Ubuntu 22.04 LTS, minimo 2 vCPU y 2 GB RAM.
- Habilita SSH con tu clave y configura un firewall basico (puertos 22 y 4100 abiertos; 80/443 si usaras HTTPS).

### 1. Instalar dependencias del sistema

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y docker.io docker-compose-plugin git curl unzip ufw
sudo systemctl enable docker --now
sudo usermod -aG docker $USER
```

Vuelve a entrar via SSH para que el grupo `docker` se aplique a tu usuario.

### 2. Preparar estructura y modelo Vosk

```bash
sudo mkdir -p /opt/video-converter/data/outputs /opt/video-converter/tmp/jobs /opt/video-converter/models/vosk
sudo chown -R $USER:$USER /opt/video-converter

curl -L -o /opt/video-converter/models/vosk/es.zip https://alphacephei.com/vosk/models/vosk-model-small-es-0.42.zip
unzip /opt/video-converter/models/vosk/es.zip -d /opt/video-converter/models/vosk
rm /opt/video-converter/models/vosk/es.zip
```

### 3. Descargar el repositorio y crear `.env`

```bash
cd /opt/video-converter
git clone https://github.com/tu-organizacion/video-converter.git .
nano .env
```

- Usa el mismo contenido de [Variables de entorno](#variables-de-entorno).
- Cambia `INITIAL_API_KEY` por un valor seguro.
- Mantiene `DATABASE_URL` apuntando a `postgres` si usaras el Postgres del docker-compose. Si tienes una base gestionada externa, ajusta la URL en consecuencia.

### 4. (Opcional) Usuario dedicado sin login

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin videoapi
sudo chown -R videoapi:videoapi /opt/video-converter
```

Luego ejecuta los comandos Docker como `videoapi`:
```bash
sudo -u videoapi docker compose up -d --build
```

### 5. Construir y arrancar en el servidor

```bash
cd /opt/video-converter
docker compose up -d --build
docker compose ps
```

### 6. Migraciones y seed en el droplet

```bash
docker compose run --rm app npx prisma migrate deploy
docker compose run --rm \
  -e DATABASE_URL=postgresql://videoconverter:videoconverter@postgres:5432/video_converter?schema=public \
  app npm run prisma:seed
```

### 7. Configurar firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 4100/tcp
sudo ufw enable
```

Si usaras HTTPS con Nginx/Traefik, abre tambien 80/443 y configura el proxy para reenviar al puerto 4100 interno.

### 8. Verificar servicio

- En el droplet:
  ```bash
  curl http://localhost:4100/health
  docker compose logs -f app
  ```
- Desde tu maquina: prueba `http://<IP_PUBLICA>:4100/api/v1/captionize` en Postman con tu API key.

Los artefactos generados quedaran bajo `/opt/video-converter/data/outputs`. Respaldalos segun tu estrategia (volumen adicional, sincronizacion a S3, etc.).

### 9. Actualizar despliegues

Cuando subas una nueva version:
```bash
cd /opt/video-converter
git pull
docker compose down
docker compose up -d --build
docker compose run --rm app npx prisma migrate deploy
```

---

## Migraciones y datos iniciales

| Comando | Uso |
| --- | --- |
| `docker compose run --rm app npx prisma migrate deploy` | Aplica las migraciones en la base del contenedor. |
| `DATABASE_URL=postgresql://videoconverter:videoconverter@localhost:15432/... npm run prisma:seed` | Ejecuta el seed desde el host (crea organizacion y API key inicial). |
| `docker compose run --rm -e DATABASE_URL=... app npm run prisma:seed` | Variante para ejecutar el seed dentro del contenedor especificando la URL correcta. |
| `npx prisma migrate dev --name <cambio>` | Crea una nueva migracion (solo en desarrollo). |

---

## Pruebas de las APIs

### Configurar Postman

1. Crea un entorno con:
   - `baseUrl` = `http://localhost:4100` (o la IP de tu servidor).
   - `apiKey` = valor de tu API key.
2. Agrega el encabezado `x-api-key: {{apiKey}}` en cada peticion.

### 1. Health check

- Metodo `GET`
- URL `{{baseUrl}}/health`
- Respuesta esperada: `status: ok`.

### 2. Imagen -> Video con caption

1. `POST {{baseUrl}}/api/v1/video-from-image`
2. Body `form-data`:
   - `image` (File) -> selecciona la imagen.
   - Opcionales: `durationSeconds`, `fps`, `captionText`, `textColor`, `bgColor`.
3. Guarda la respuesta (`Save Response -> Save to a file`).
4. Revisa cabeceras: `X-Job-Id` y `Content-Disposition`.

### 3. Video -> Video con subtitulos (captionize)

1. `POST {{baseUrl}}/api/v1/captionize`
2. Body `form-data`:
   - `video` (File) -> video original.
   - `style` (Text, opcional) -> `instagram` o `clean`.
   - `backend` (Text, opcional) -> `vosk`, `mock` o `whisper`.
3. Guarda el MP4 devuelto y consulta las cabeceras:
   - `X-Subtitles-Filename`: nombre del `.ass` generado en `OUTPUT_STORAGE_PATH`.
   - `X-Transcript-Backend`: debe mostrar `vosk` si la transcripcion se ejecuto correctamente.

#### Presets visuales disponibles

- Puedes elegir el preset visual con el campo `style` en `form-data`:
  - `instagram`: barra inferior con buen contraste.
  - `clean`: texto limpio centrado con outline.
  - `instagram_plus`: fuente más grande, mayor outline y caja más visible.
  - `clean_plus`: variante de clean con márgenes y sombra reforzados.
  - `upper`: subtítulos en la parte superior (evita tapar UI inferior).
  - `caption_bar`: barra inferior más alta y legible.

- Fuentes personalizadas (opcional):
  - Monta una carpeta con fuentes: en `docker-compose.yml` añade `- ./fonts:/usr/share/fonts/custom` dentro de `app.volumes`.
  - En `.env` define `CAPTION_FONTS_DIR=/usr/share/fonts/custom`.
  - `docker compose up -d` para que FFmpeg/ASS las encuentre al quemar subtítulos.

### 4. Swagger protegido

- Navega a `{{baseUrl}}/docs`.
- Haz clic en `Authorize`, introduce la API key y ejecuta los endpoints desde la interfaz.

---

## Comandos npm utiles

| Comando | Descripcion |
| --- | --- |
| `npm run start:dev` | Arranca NestJS en modo watch (requiere Node y FFmpeg instalados localmente). |
| `npm run build` | Compila TypeScript a `dist/`. |
| `npm run lint` | Ejecuta ESLint con autofix. |
| `npm run test` | Ejecuta pruebas unitarias (si existen). |

---

## Notas adicionales

- El endpoint `captionize` actualmente procesa de forma sincrona; para cargas altas considera usar una cola (BullMQ) y workers dedicados.
- Los videos y subtitulos se guardan en `OUTPUT_STORAGE_PATH` (por defecto `data/outputs`). Configura respaldos si los deseas preservar a largo plazo.
- Ajusta `MAX_VIDEO_UPLOAD_MB` segun la capacidad de tu maquina. Si el video supera este tamano, el endpoint lo rechazara.
- Si cambias `SUBS_STYLE`, edita los presets en `src/modules/rendering/captioning.service.ts`.
- Mantener el modelo Vosk dentro de `./models/vosk` permite reconstruir la imagen sin descargarlo cada vez. Si prefieres Whisper, instala el backend apropiado y cambia `ASR_BACKEND=whisper` y `WHISPER_MODEL`.

---

Necesitas integraciones adicionales? Abre un issue con el detalle del flujo deseado.

