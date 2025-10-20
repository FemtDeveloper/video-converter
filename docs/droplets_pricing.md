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

1. Empezar con Basic 1 GiB (US$6) y medir tiempos reales de 2–3 trabajos.
2. Ajustar concurrencia=1, preset veryfast y/o `-threads 1` si buscas suavizar picos.
3. Si el negocio escala o necesitas más estabilidad, pasar a 2 GiB.

## Tabla de márgenes estimados (supuestos)

Suposiciones para esta tabla:

- RTF = 1.0 (1 min de video tarda ~1 min en procesar)
- Dos escenarios de utilización U: 10% y 20% del mes
- Dos precios por minuto de salida: $0.50/min y $2.50/min
- Margen bruto = Ingreso − Costo del Droplet (no incluye almacenamiento, transferencia, comisiones, impuestos ni mano de obra)

Fórmulas:

- Minutos procesados = 43,200 × U × Concurrencia (C)
- Ingreso = Minutos procesados × Precio

Escoge C sugerido por plan:

- 1 vCPU → C = 1
- 2 vCPUs → C = 2

### U = 10%

| Plan recomendado   | vCPU/RAM  |   C | Costo/mes | Min procesados | Ingreso @ $0.50 | Margen @ $0.50 | Ingreso @ $2.50 | Margen @ $2.50 |
| ------------------ | --------- | --: | --------: | -------------: | --------------: | -------------: | --------------: | -------------: |
| Basic 1 GiB        | 1 / 1 GiB |   1 |        $6 |          4,320 |          $2,160 |         $2,154 |         $10,800 |        $10,794 |
| Basic 2 GiB        | 1 / 2 GiB |   1 |       $12 |          4,320 |          $2,160 |         $2,148 |         $10,800 |        $10,788 |
| Basic 2 vCPU 2 GiB | 2 / 2 GiB |   2 |       $18 |          8,640 |          $4,320 |         $4,302 |         $21,600 |        $21,582 |
| Basic 2 vCPU 4 GiB | 2 / 4 GiB |   2 |       $24 |          8,640 |          $4,320 |         $4,296 |         $21,600 |        $21,576 |
| Basic 4 vCPU 8 GiB | 4 / 8 GiB |   3 |       $48 |         12,960 |          $6,480 |         $6,432 |         $32,400 |        $32,352 |
| Basic 4 vCPU 8 GiB | 4 / 8 GiB |   4 |       $48 |         17,280 |          $8,640 |         $8,592 |         $43,200 |        $43,152 |

### U = 20%

| Plan recomendado   | vCPU/RAM  |   C | Costo/mes | Min procesados | Ingreso @ $0.50 | Margen @ $0.50 | Ingreso @ $2.50 | Margen @ $2.50 |
| ------------------ | --------- | --: | --------: | -------------: | --------------: | -------------: | --------------: | -------------: |
| Basic 1 GiB        | 1 / 1 GiB |   1 |        $6 |          8,640 |          $4,320 |         $4,314 |         $21,600 |        $21,594 |
| Basic 2 GiB        | 1 / 2 GiB |   1 |       $12 |          8,640 |          $4,320 |         $4,308 |         $21,600 |        $21,588 |
| Basic 2 vCPU 2 GiB | 2 / 2 GiB |   2 |       $18 |         17,280 |          $8,640 |         $8,622 |         $43,200 |        $43,182 |
| Basic 2 vCPU 4 GiB | 2 / 4 GiB |   2 |       $24 |         17,280 |          $8,640 |         $8,616 |         $43,200 |        $43,176 |
| Basic 4 vCPU 8 GiB | 4 / 8 GiB |   3 |       $48 |         25,920 |         $12,960 |        $12,912 |         $64,800 |        $64,752 |
| Basic 4 vCPU 8 GiB | 4 / 8 GiB |   4 |       $48 |         34,560 |         $17,280 |        $17,232 |         $86,400 |        $86,352 |

Notas:

- Si RTF=2.0 (más lento), los minutos procesados y los ingresos se reducen a la mitad.
- Si el precio por minuto es menor, los márgenes caen proporcionalmente.
- La utilización real al inicio suele estar entre 2% y 8%; estos valores son techos teóricos dados U y demanda suficientes.
- Para C=3–4, se recomienda Basic 4 vCPU / 8 GiB como base "olgada". Alternativa de CPU dedicada: CPU-Optimized 4 vCPU / 8 GiB (~$84/mes) con rendimiento más consistente.
