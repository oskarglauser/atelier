# syntax=docker/dockerfile:1
# Built by Coolify on every push to main. No secrets here: all config comes
# from env vars at runtime (see .env.example), except the public build-time
# values below that are baked into the editor bundle.
#
# One image serves everything: the built editor, the API and the document
# socket all come from the same origin, which is what keeps auth free of CORS
# and cross-site cookie problems.

FROM node:24-alpine AS base

# ---- the editor (Vite SPA at the repo root) --------------------------------
FROM base AS client-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM base AS client
WORKDIR /app
# Appscope's public key (pk_…) for the tracking script. Not a secret.
ARG APPSCOPE_KEY=
ENV APPSCOPE_KEY=$APPSCOPE_KEY
COPY --from=client-deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- the server ------------------------------------------------------------
FROM base AS server-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM base AS server
WORKDIR /app/server
COPY --from=server-deps /app/server/node_modules ./node_modules
COPY server/ ./
RUN npm run build

# ---- what actually runs ----------------------------------------------------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3006

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs atelier

# Production dependencies only; the build tooling stays out of the image.
COPY --from=server-deps --chown=atelier:nodejs /app/server/node_modules ./server/node_modules
COPY --from=server --chown=atelier:nodejs /app/server/dist ./server/dist
COPY --chown=atelier:nodejs server/package.json ./server/package.json
# SQL migrations, applied at startup by the server before it listens.
COPY --chown=atelier:nodejs server/drizzle ./server/drizzle
# The built editor, served as static files.
COPY --from=client --chown=atelier:nodejs /app/dist ./dist

USER atelier
EXPOSE 3006

# Coolify runs its own check against /health too. Point its host at 127.0.0.1,
# not localhost: localhost resolves to ::1 in Alpine while the server listens
# on IPv4 (infra INFRA.md "Deploys").
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1

WORKDIR /app/server
CMD ["node", "dist/index.js"]
