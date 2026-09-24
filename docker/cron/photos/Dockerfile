# syntax=docker/dockerfile:1.7
FROM oven/bun:1-alpine

WORKDIR /app

COPY docker/cron/photos/package.json ./package.json
RUN bun install

COPY scripts/mirrorPhotos.ts ./scripts/mirrorPhotos.ts
COPY scripts/warmPhotoCache.ts ./scripts/warmPhotoCache.ts
COPY src/lib/google-photos ./src/lib/google-photos
COPY src/lib/r2 ./src/lib/r2

CMD ["bun", "scripts/mirrorPhotos.ts"]
