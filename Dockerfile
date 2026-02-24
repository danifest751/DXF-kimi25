FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core-engine/package.json packages/core-engine/package.json
COPY packages/api-service/package.json packages/api-service/package.json
COPY packages/bot-service/package.json packages/bot-service/package.json
COPY packages/pricing/package.json packages/pricing/package.json
COPY packages/ui-app/package.json packages/ui-app/package.json

RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./
COPY packages/core-engine/package.json packages/core-engine/package.json
COPY packages/api-service/package.json packages/api-service/package.json
COPY packages/bot-service/package.json packages/bot-service/package.json
COPY packages/pricing/package.json packages/pricing/package.json
COPY packages/ui-app/package.json packages/ui-app/package.json

RUN npm ci --omit=dev

COPY --from=builder /app/packages/core-engine/dist /app/packages/core-engine/dist
COPY --from=builder /app/packages/pricing/dist /app/packages/pricing/dist
COPY --from=builder /app/packages/bot-service/dist /app/packages/bot-service/dist
COPY --from=builder /app/packages/api-service/dist /app/packages/api-service/dist
COPY --from=builder /app/packages/ui-app/dist /app/packages/ui-app/dist

EXPOSE 3000
CMD ["node", "packages/api-service/dist/server.js"]
