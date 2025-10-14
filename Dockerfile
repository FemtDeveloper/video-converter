FROM node:20-slim AS builder

WORKDIR /app

RUN apt-get update   && apt-get install -y --no-install-recommends ffmpeg build-essential python3 pkg-config   && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate

COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY src ./src

RUN npm run build

# Production image
FROM node:20-slim AS production

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update   && apt-get install -y --no-install-recommends ffmpeg tini   && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev
RUN npx prisma generate

COPY --from=builder /app/dist ./dist

RUN groupadd --system app \
  && useradd --system --gid app --create-home app \
  && mkdir -p /app/tmp/jobs /app/data/outputs \
  && chown -R app:app /app/tmp /app/data

USER app

ENV APP_PORT=4100
EXPOSE 4100

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
