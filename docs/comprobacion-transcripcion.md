# Guía rápida de comprobación de subtítulos Vosk

Sigue esta lista cada vez que necesites verificar que el pipeline `captionize` está generando subtítulos reales (no la frase “Transcripcion no disponible”).

## 1. Verificar variables de entorno dentro del contenedor

```bash
docker compose exec app sh -lc 'echo "ASR_BACKEND=$ASR_BACKEND"; echo "VOSK_MODEL_PATH=$VOSK_MODEL_PATH"'
```

- La salida debe mostrar `ASR_BACKEND=vosk` y la ruta correcta del modelo (por ejemplo `/models/vosk/vosk-model-small-es-0.42`).
- Si ves `mock`, edita `.env`, cambia a `vosk` y reinicia: `docker compose down && docker compose up -d --build`.

## 2. Confirmar que el modelo está montado

```bash
docker compose exec app sh -lc 'ls /models/vosk'
```

- Debes ver la carpeta del modelo (`vosk-model-small-es-0.42` u otra que hayas montado).
- Si la ruta está vacía, revisa:
  1. Que `docker-compose.yml` tenga el volumen `./models/vosk:/models/vosk` en el servicio `app`.
  2. Que el modelo se haya descomprimido en el host (`models/vosk/...`).

## 3. Revisar logs del servicio

```bash
docker compose logs app | Select-String Vosk
```

No deberían aparecer errores del tipo `Failed to load vosk module` o `VOSK_MODEL_PATH is not configured`. Si los hay:
- Reconstruye la imagen: `docker compose build --no-cache app`.
- Asegúrate de haber corrido `docker compose up -d --build` después de modificar `.env`.

## 4. Usar un audio en el idioma correcto

- El modelo `vosk-model-small-es-0.42` solo transcribe español.
- Para audio en inglés u otro idioma monta un modelo equivalente y actualiza `VOSK_MODEL_PATH`.

## 5. Probar el endpoint

```text
POST http://localhost:4100/api/v1/captionize
Headers:
  x-api-key: <tu_api_key>
Body (form-data):
  video (File) -> tu video de prueba
```

En la respuesta revisa las cabeceras:
- `X-Transcript-Backend` debe indicar `vosk`.
- Guárdate el `.mp4` y verifica que los subtítulos quemados coinciden con el audio.

## 6. Reset rápido si persiste el placeholder

1. `docker compose down`
2. Revisa `.env`, modelo y volumen.
3. `docker compose up -d --build`
4. `docker compose logs app`
5. Repite la prueba en Postman.

Si después de estos pasos sigues viendo “Transcripcion no disponible”, abre un issue con la captura de los logs y el comando que estás ejecutando.
