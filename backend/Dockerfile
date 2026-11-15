FROM node:20-alpine AS builder
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/backend/dist ./dist
COPY package.json /app/package.json
ENV NODE_ENV=production HOST=0.0.0.0
EXPOSE 5000
CMD ["node", "dist/server.js"]
