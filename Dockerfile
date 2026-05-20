# Multi-stage Docker build for AWS Lightsail Container Service.
# Builds the Vite client in one layer, the Express+Prisma server in another,
# then assembles a slim production image. node:20-slim (Debian) is used over
# alpine to avoid native-module headaches with bcrypt and Prisma engines.

# ─── Stage 1 : build the Vite client ──────────────────────────────────
FROM node:20-slim AS client-builder
WORKDIR /app/client

# Install deps first so npm ci is cached when only source changes
COPY client/package.json client/package-lock.json* ./
RUN npm ci --include=dev

COPY client/ ./
RUN npm run build
# Output is in /app/client/dist


# ─── Stage 2 : install server deps + Prisma client ────────────────────
FROM node:20-slim AS server-builder
WORKDIR /app/server

# Prisma needs OpenSSL at runtime for engine TLS handshakes
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY server/package.json server/package-lock.json* ./
# Keep dev deps so `prisma` CLI is available at startup for `prisma db push`.
# Removing devDeps to save image size means we'd need to bake migrations into
# build time (more complex). Image is ~250 MB either way — not worth optimizing.
RUN npm ci

COPY server/prisma ./prisma
RUN npx prisma generate


# ─── Stage 3 : production runtime image ───────────────────────────────
FROM node:20-slim
WORKDIR /app

# Same OpenSSL requirement for Prisma engines in runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Server (with its node_modules and generated Prisma client)
COPY --from=server-builder /app/server/node_modules ./server/node_modules
COPY server/ ./server/
COPY --from=server-builder /app/server/node_modules/.prisma ./server/node_modules/.prisma
COPY --from=server-builder /app/server/node_modules/@prisma/client ./server/node_modules/@prisma/client

# Built client served as static files from server (see server/src/index.js:413)
COPY --from=client-builder /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

WORKDIR /app/server

# Push schema on each start so additive Prisma changes go live with the deploy.
# --accept-data-loss is required for non-interactive runs.
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node src/index.js"]
