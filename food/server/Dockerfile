# Build from the repository root:  docker build -f food/server/Dockerfile -t kezias-food-api .
ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE}
WORKDIR /app
COPY food/server/package.json food/server/package-lock.json ./
RUN npm ci --omit=dev
COPY food/server ./
ENV NODE_ENV=production UPLOADS_DIR=/data/uploads PORT=8090
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 8090
CMD ["sh", "-c", "node scripts/migrate.js && node src/server.js"]
