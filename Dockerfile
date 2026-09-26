# Node 22 (trae node:sqlite nativo) sobre Debian, para poder instalar ffmpeg con apt.
FROM node:22-bookworm-slim

# ffmpeg crea los previews MP3 livianos, la marca de agua de los productores Free,
# el MP3 de 320 kbps de entrega y las miniaturas de las portadas.
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# El proyecto no tiene dependencias npm; se deja por si se agregan en el futuro.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund || true

COPY . .

# Carpetas de datos (en Railway el Volume se monta aparte y la app las crea ahí solas).
RUN mkdir -p db uploads/audio uploads/covers uploads/receipts uploads/watermark uploads/masters uploads/tmp

ENV NODE_ENV=production
# Oculta el aviso "SQLite is an experimental feature" en los logs.
ENV NODE_NO_WARNINGS=1

EXPOSE 3000

CMD ["node", "server.js"]
