## API Parameters Reference

### POST /api/v1/video-from-image

Body (multipart/form-data):

- image (File, requerido): JPG/PNG/WebP.
- style (Text, opcional): instagram, clean, instagram_plus, clean_plus, upper, caption_bar, outline_color.
- durationSeconds (Text, opcional): 1–120; duración del video resultante.
- fps (Text, opcional): 1–60; frames por segundo (por defecto 30).
- backgroundColor (Text, opcional): color de fondo del lienzo 1080x1920 en #RRGGBB.
- fillFrame (Text, opcional): true|false. Si true, la imagen se redimensiona en modo "cover" para rellenar todo el cuadro 1080x1920 (recorta excedentes). Si false/omitido, se usa "contain" con bandas de color (backgroundColor).

Caption (superpuesto con drawtext):

- captionText (Text, opcional): texto a mostrar.
- textColor (Text, opcional): color del texto #RRGGBB.
- outlineColor (Text, opcional): color del borde del texto #RRGGBB.
- outlineWidth (Text, opcional): 0–20; grosor del borde.
- fontSize (Text, opcional): 16–120.
- position (Text, opcional): top o bottom.
- bgColor (Text, opcional): color del fondo de la placa bajo el texto #RRGGBB.
- bgOpacity (Text, opcional): 0–1; opacidad del fondo (ej. 0.6).
- bgEnabled (Text, opcional): true|false. Por defecto false (no dibuja placa); si true, dibuja placa con bgColor/bgOpacity.

Respuesta: MP4 (video/mp4). Cabeceras: X-Job-Id.

Notas:
- El video final siempre es 1080x1920 con la imagen centrada y relleno del color de fondo.
- Si no envías captionText, no se dibuja texto.

---

### POST /api/v1/captionize

Body (multipart/form-data):

- video (File, requerido): MP4/MOV.
- style (Text, opcional): instagram, clean, instagram_plus, clean_plus, upper, caption_bar, outline_color.
- backend (Text, opcional): vosk | whisper | mock (por defecto vosk si está configurado).
- language (Text, opcional): auto | en | es | pt | de | hi | zh. Idioma para la transcripción. Por defecto: auto (detección entre esos idiomas). Si no se reconoce, se devuelve aviso inmediato de "Transcripción no disponible".

Overrides visuales del estilo (se aplican sobre la línea Style del preset ASS):

- textColor (Text, opcional): color del texto #RRGGBB.
- outlineColor (Text, opcional): color del borde #RRGGBB.
- fontSize (Text, opcional): 24–120.
- position (Text, opcional): top o bottom.
- bgColor (Text, opcional): color de fondo de la placa (ASS BackColour) #RRGGBB.
- bgOpacity (Text, opcional): 0–1; opacidad del fondo (se aplica con BorderStyle=3).
- bgEnabled (Text, opcional): true|false. Por defecto false (desactiva BackColour); si true, aplica bgColor/bgOpacity.
- karaoke (Text, opcional): true|false. Si true, resalta palabra por palabra usando tiempos del ASR.
- karaokeMode (Text, opcional): k | kf | ko. Modo de karaoke (discreto, barrido/fill o outline). Por defecto: kf.
 - karaokeOffsetMs (Text, opcional): entero -1000..1000. Desplaza el resaltado (ms). Útil para ajustar si notas que el highlight va “tarde” o “temprano”.
 - karaokeScale (Text, opcional): factor 0.5–2.0. Escala la duración de cada palabra (1 = sin cambio).

Respuesta: MP4 (video/mp4) con subtítulos quemados. Cabeceras: `X-Job-Id`, `X-Subtitles-Filename`, `X-Transcript-Backend`.

Notas:
- Para transcripción real en español, monta el modelo Vosk y define `ASR_BACKEND=vosk` y `VOSK_MODEL_PATH`.
- Si el audio no coincide con el idioma del modelo, la transcripción puede ser vacía.
