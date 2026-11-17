# The storefront app image: one small Node program that plays every
# storefront service (api, worker, payments, ...) by its MODE. The layers are
# deliberately uneven so the Images > Layers tab has something to show.
FROM node:22-alpine
RUN apk add --no-cache curl ca-certificates
WORKDIR /app
RUN mkdir -p /app/data && head -c 12582912 /dev/urandom > /app/data/catalog-snapshot.bin
COPY config/ ./config/
COPY package.json app.js probe.js ./
ENV NODE_ENV=production
LABEL org.opencontainers.image.title="storefront-app" org.opencontainers.image.version="1.4.2"
CMD ["node", "/app/app.js"]
