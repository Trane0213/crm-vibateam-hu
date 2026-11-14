# VIBA CRM tervcsomag-feldolgozó tároló. Node 22 (TypeScript közvetlen futtatás) + poppler (PDF).
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends poppler-utils ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /work && chown node:node /work
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev
COPY src ./src
USER node
ENV NODE_ENV=production PORT=8080 WORK_DIR=/work
EXPOSE 8080
CMD ["node", "src/server.ts"]
