# syntax=docker/dockerfile:1.7
FROM oven/bun:1-alpine

WORKDIR /app

# Deps first so `bun install` layer is cached until package.json changes.
COPY docker/cron/listening/package.json ./package.json
RUN bun install

# Only the files syncListening.ts actually reaches at runtime — same shape as
# briOS's tree so `import "../src/lib/..."` resolves.
COPY scripts/syncListening.ts ./scripts/syncListening.ts
COPY src/lib/spotify.ts ./src/lib/spotify.ts
COPY src/lib/db ./src/lib/db

CMD ["bun", "scripts/syncListening.ts"]
