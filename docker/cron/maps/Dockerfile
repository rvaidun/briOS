# sync_places.py is pure stdlib — no pip install needed.
FROM python:3.13-slim

COPY docker/cron/maps/sync_places.py /app/sync_places.py

# Map URL is supplied via MAPS_URL env (set in cron/maps/.env on the host).
CMD ["sh", "-c", "exec python /app/sync_places.py \"$MAPS_URL\" --upsert"]
