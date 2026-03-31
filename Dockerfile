# ── Build stage: compile native modules ───────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Build tools needed for better-sqlite3 native compilation
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

# ── Runtime stage ─────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Copy compiled node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY package.json ./
COPY server.js    ./
COPY db/          ./db/
COPY public/      ./public/

# Data directory for SQLite persistence
RUN mkdir -p /app/data

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "server.js"]
