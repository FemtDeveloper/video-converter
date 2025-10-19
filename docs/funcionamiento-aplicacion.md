# Guia de funcionamiento de Video Converter

Este documento detalla el flujo de trabajo y la arquitectura de la aplicacion **Video Converter**, un servicio NestJS que transforma imagenes estaticas en videos verticales listos para uso en plataformas moviles.

## Resumen de arquitectura

- **Framework**: NestJS con TypeScript y Express como servidor HTTP.
- **Procesamiento multimedia**: `fluent-ffmpeg` crea videos MP4 a partir de imagenes en memoria.
- **Persistencia**: Prisma ORM contra PostgreSQL registra organizaciones, claves de API y trabajos.
- **Infraestructura auxiliar**: Redis gestiona limites de peticiones y futuras colas de trabajo.
- **Distribucion**: Dockerfile y `docker-compose.yml` levantan API, Postgres, Redis y nginx reverse proxy.

### Componentes principales

| Capa | Archivo(s) clave | Descripcion |
| --- | --- | --- |
| Configuracion | `src/config/configuration.ts`, `src/config/validation.ts` | Define el esquema de variables de entorno y expone valores tipados para toda la aplicacion. |
| Arranque | `src/main.ts`, `src/app.module.ts` | Crea el servidor, aplica seguridad (Helmet), validaciones globales y Swagger protegido. |
| Persistencia | `src/common/prisma/*`, `prisma/schema.prisma` | Prisma mantiene conexiones a Postgres y define los modelos `Organization`, `ApiKey` y `Job`. |
| Cache y limites | `src/common/redis`, `src/common/rate-limit` | Redis almacena contadores por API key y soporte a futuras colas. |
| Seguridad | `src/modules/auth/*` | Valida API keys, aplica rate limiting y expone un guard reusable. |
| Procesamiento | `src/modules/rendering/*` | Expone endpoints y logica para convertir imagenes en videos verticales con subtitulos opcionales. |
| Operaciones | `src/modules/health`, `src/modules/plan` | Entregan monitoreo basico y el plan de evolucion del producto. |

## Ciclo de arranque

1. **Carga de configuracion**: `ConfigModule.forRoot` valida variables de entorno con Joi y publica `AppConfig`.
2. **Seguridad base**: `main.ts` aplica Helmet con politicas CSP estrictas y desactiva `crossOriginResourcePolicy` para servir Swagger correctamente.
3. **Validacion de solicitudes**: un `ValidationPipe` global normaliza cuerpos JSON, hace cast de tipos y rechaza campos desconocidos.
4. **Recursos compartidos**: se inicializan Prisma y Redis con hooks de apagado ordenado para evitar fugas de conexiones.
5. **Proteccion de Swagger**: rutas `/docs` y `/docs-json` exigen la misma API key que el resto del servicio antes de exponer la UI.
6. **Servidor HTTP**: la aplicacion queda escuchando en `0.0.0.0:${APP_PORT}` (por defecto 4100).

## Seguridad y control de acceso

- **Autenticacion**: el `ApiKeyGuard` lee el encabezado configurado (`x-api-key` por defecto) y consulta la base de datos usando `ApiKeyService`.
- **Almacenamiento seguro**: las claves se guardan en Bcrypt (`keyHash`) y se buscan primero por prefijo (`keyPrefix`) para reducir consultas.
- **Rate limiting**: `RateLimitService` usa Redis para contabilizar peticiones por clave hash SHA-256; agrega encabezados `x-ratelimit-*` en cada respuesta.
- **Politicas de Max Upload**: el controlador rechaza imagenes mayores a `limits.maxImageUploadMb` (5 MB por defecto) y bloquea MIME types no permitidos.

## Endpoints expuestos

| Ruta | Metodo | Autenticacion | Descripcion |
| --- | --- | --- | --- |
| `/api/v1/video-from-image` | POST | API key + rate limiting | Recibe una imagen (`image`) y opciones para producir un video MP4 vertical. Acepta subtitulos en formato JSON y devuelve el binario directo en streaming. |
| `/health` | GET | No | Valida conectividad a Postgres y Redis. Responde `ok` o `degraded`. |
| `/implementation-plan` | GET | API key | Exponde las fases de evolucion previstas (MVP, colas, monetizacion). Protegido para uso interno. |
| `/docs`, `/docs-json` | GET | API key | Documentacion Swagger generada automaticamente. |

## Flujo de conversion de imagen a video

1. **Solicitud**: un cliente envia un `multipart/form-data` con campo `image` y parametros opcionales (`durationSeconds`, `fps`, `backgroundColor`, etc.).
2. **Guardia**: `ApiKeyGuard` autentica, ejecuta rate limiting y anexa contexto (`organizationId`, `apiKeyId`) al request.
3. **Validacion**: el DTO `VideoFromImageDto` transforma tipos, valida rangos y normaliza cue points de subtitulos si se proporcionan.
4. **Registro de trabajo**: `JobsService.createJob` persiste un registro `Job` con estado `PROCESSING` y payload de entrada.
5. **Almacen temporal**: el servicio crea un directorio en `paths.temp` y guarda la imagen saneando el nombre de archivo.
6. **Ejecucion FFmpeg**: `RenderingService` invoca `fluent-ffmpeg` con filtros para forzar resolucion 1080x1920, centrar la imagen, rellenar con color configurado y quemar subtitulos en pantalla cuando existen.
7. **Post-procesamiento**: se ajustan permisos (`chmod 640`), se calcula tamano, se marca el trabajo como `COMPLETED` junto con metadata del resultado y se persiste un archivo `.srt` en la carpeta de outputs.
8. **Respuesta**: el video se abre en `createReadStream` y se envia como descarga con encabezados `Content-Type`, `Content-Length`, `Content-Disposition` y `X-Job-Id`.
9. **Limpieza**: archivos temporales y carpetas del trabajo se eliminan incluso si aparece un error; ante fallos se marca `FAILED` y se borra el resultado parcial.

## Gestion de trabajos y datos

- El modelo `Job` guarda estado (`QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`), duracion, ruta de resultado y tamano.
- Actualmente los trabajos se procesan de forma sincrona dentro de la peticion HTTP, pero la tabla admite evolucion a colas asincronas (`JobType.SLIDESHOW` ya reservado).
- `JobsService.markCompleted` y `markFailed` encapsulan transiciones de estado y loguean eventos para auditoria.

## Organizaciones y claves de API

- Cada `Organization` puede tener varias `ApiKey` con prefijo consultable y opcion `isActive`.
- El script `prisma/seed.ts` genera una organizacion `beta` usando `INITIAL_API_KEY`; idealmente se rota desde un canal seguro.
- En cada uso exitoso se actualiza `lastUsedAt`, lo que permite construir analitica de consumo en el futuro.

## Configuracion por entorno

Variables relevantes (ver `src/config/configuration.ts`):

- `APP_NAME`, `APP_PORT`, `NODE_ENV`: controlan metadata y puerto de escucha.
- `API_KEY_HEADER`: nombre del encabezado requerido.
- `MAX_IMAGE_UPLOAD_MB`, `MAX_VIDEO_DURATION_SECONDS`: limites de proteccion.
- `RATE_LIMIT_WINDOW_SECONDS`, `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_BURST_CAP`: parametros de cuota.
- `TEMP_STORAGE_PATH`, `OUTPUT_STORAGE_PATH`: rutas para archivos temporales y finales.
- `DATABASE_URL`, `REDIS_URL`: conexiones externas obligatorias.
- `LOG_LEVEL`: nivel global de logs NestJS.

## Integraciones externas

- **FFmpeg**: se invoca a traves de `fluent-ffmpeg`; requiere que el binario de FFmpeg este disponible en el entorno de ejecucion.
- **Redis**: se usa tanto para rate limiting como para futuras colas BullMQ. La configuracion habilita reconexion automatica y maximo de reintentos por solicitud.
- **PostgreSQL**: Prisma maneja conexiones y migraciones (`prisma migrate`). El servicio habilita hooks de apagado limpio.

## Monitoreo y observabilidad

- **Health check** (`/health`): verifica conectividad en caliente.
- **Logs**: se usa `Logger` de NestJS en servicios clave (Prisma, Redis, Jobs, Rendering) para trazar eventos y fallos.
- **Encabezados de cuota**: permiten a los clientes ajustar su ritmo de peticiones sin esperar errores 429.

## Despliegue y ejecucion

1. Instalar dependencias: `npm install`.
2. Generar cliente Prisma: `npm run prisma:generate`.
3. Aplicar migraciones: `npm run prisma:migrate:deploy` (produccion) o `npm run prisma:migrate:dev` (desarrollo).
4. Sembrar datos iniciales: definir `INITIAL_API_KEY` y ejecutar `npm run prisma:seed`.
5. Iniciar la API: `npm run start:dev` en desarrollo o `npm run start:prod` tras compilar.
6. Con Docker: `docker-compose up --build` levanta API, Postgres, Redis y nginx ya configurado.

## Plan de evolucion

El endpoint `/implementation-plan` documenta tres fases:

1. **MVP seguro**: API key, rate limiting, conversion 9:16 y entorno Dockerizado.
2. **Procesamiento avanzado**: colas BullMQ, subtitulos, manejo de artefactos y metricas operativas.
3. **Monetizacion**: cuentas multiusuario, MFA, facturacion con Stripe y hardening adicional.

## Limitaciones actuales y consideraciones

- La conversion es sincrona; ante videos de mayor duracion podria agotar el timeout HTTP si no se delega a un worker.
- No existe interfaz para gestionar claves de API desde la API misma; se depende de Prisma o procesos internos.
- El almacenamiento de outputs es local; para despliegues distribuidos conviene migrar a almacenamiento de objetos y firmar URLs de descarga.
- La validacion de imagen soporta JPEG, PNG y WebP; otros formatos deberian rechazarse o transformarse previamente.
- Los subtitulos solo se aceptan como arreglo JSON en la misma solicitud y se guardan como `.srt` local; aun no existe endpoint dedicado para descargarlos.

Esta guia debe servir como punto de partida para nuevos colaboradores y operaciones encargadas de ejecutar o escalar el servicio.
