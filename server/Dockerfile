# Build from the repository root:  docker build -f server/Dockerfile -t srinagar-bazaar-api .
FROM node:22-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev
COPY shared ./shared
COPY server ./server
COPY data/srinagar_businesses.csv ./data/srinagar_businesses.csv
COPY app/shops.json app/sights.json ./app/
WORKDIR /app/server
ENV NODE_ENV=production UPLOADS_DIR=/data/uploads
USER node
EXPOSE 8080
CMD ["sh", "-c", "node scripts/migrate.js && node src/server.js"]
