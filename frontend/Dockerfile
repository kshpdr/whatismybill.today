# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .

# NEXT_PUBLIC_* vars are baked into the JS bundle at build time
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
ENV NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=$NEXT_PUBLIC_TELEGRAM_BOT_USERNAME

RUN npm run build

# ─── Runtime stage ────────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
