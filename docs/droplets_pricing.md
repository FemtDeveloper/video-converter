# Guía rápida: Droplets mínimos para empezar (DigitalOcean)

Consulta y comparativa de los planes más económicos de DigitalOcean para arrancar tu servicio de conversión/subtítulos. Incluye enlaces a precios oficiales (verificados el 2025-10-19).

## Enlaces oficiales

- Droplets (precios): https://www.digitalocean.com/pricing/droplets
- Documentación Droplets: https://docs.digitalocean.com/products/droplets/
- Calculadora: https://www.digitalocean.com/pricing/calculator

## Planes básicos (los más baratos)

DigitalOcean ofrece “Basic Droplets” con CPU compartida (ideales para cargas puntuales/bursty):

- Basic 512 MiB RAM, 1 vCPU, 10 GB SSD — ~US$4/mes
- Basic 1 GiB RAM, 1 vCPU, 25 GB SSD — ~US$6/mes
- Basic 2 GiB RAM, 1 vCPU, 50 GB SSD — ~US$12/mes

Notas prácticas para tu caso (ffmpeg + Vosk + Nest + Postgres/Redis):
- 1 GiB RAM es el mínimo realista si ejecutas 1 job a la vez.
- 2 GiB RAM ofrece margen (menos swap, menos riesgo de lentitud y OOM).
- 512 MiB solo para pruebas muy básicas; no recomendado para producción de ffmpeg.

## ¿Cuándo subir de plan?

- Si ves swap constante (>200–300 MB sostenidos) o procesos de ffmpeg muy lentos.
- Si necesitas concurrencia >1 (procesar dos trabajos en paralelo).
- Si migras Postgres/Redis a gestionado, puedes mantener 1 GiB; si permanecen en el Droplet, 2 GiB ayuda.

## Siguientes pasos

1) Empezar con Basic 1 GiB (US$6) y medir tiempos reales de 2–3 trabajos.
2) Ajustar concurrencia=1, preset veryfast y/o `-threads 1` si buscas suavizar picos.
3) Si el negocio escala o necesitas más estabilidad, pasar a 2 GiB.
