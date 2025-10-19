FROM node:20-slim AS builder

WORKDIR /app

RUN apt-get update   && apt-get install -y --no-install-recommends ffmpeg build-essential python3 pkg-config   && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
RUN npm install
RUN npx prisma generate

COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY src ./src

RUN npm run build

# Production image
FROM node:20-slim AS production

ENV NODE_ENV=production \
    npm_config_unsafe_perm=true \
    npm_config_build_from_source=true
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    tini \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    pkg-config \
  && rm -rf /var/lib/apt/lists/*

# Python virtualenv for Vosk (avoid PEP 668 system restrictions)
RUN python3 -m venv /opt/venv
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

COPY package*.json ./
COPY prisma ./prisma
RUN npm install --omit=dev --no-audit --no-fund
RUN pip install --no-cache-dir vosk==0.3.45
RUN npx prisma generate

COPY --from=builder /app/dist ./dist
COPY scripts ./scripts

RUN groupadd --system app \
  && useradd --system --gid app --create-home app \
  && mkdir -p /app/tmp/jobs /app/data/outputs \
  && chown -R app:app /app/tmp /app/data

USER app

ENV APP_PORT=4100
EXPOSE 4100

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
