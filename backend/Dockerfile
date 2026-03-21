# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ─── Runtime stage ────────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

# OCR fallback dependencies
RUN apk add --no-cache poppler-utils tesseract-ocr tesseract-ocr-data-eng

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Copy SQL migration files — tsc ignores .sql so we copy them manually
COPY --from=builder /app/src/db/migrations ./dist/db/migrations

ENV NODE_ENV=production
EXPOSE 3001

# Run migrations then start the server
CMD sh -c "node dist/db/migrate.js && node dist/index.js"
