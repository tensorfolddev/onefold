# syntax=docker/dockerfile:1
# One image runs every 1Fold process: the website (the default command), the worker (`node src/worker/index.ts`) and
# migrations (`node src/server/db/migrate.ts`). Built once per environment, because the staging badge is part of the
# browser bundle, and tagged ghcr.io/<repo>:<env>-<commit>. Build: docker build --build-arg APP_ENV=stg --build-arg GIT_SHA=$(git rev-parse HEAD) .
ARG NODE_IMAGE=node:22.23.2-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
ARG APP_ENV=prod
ARG GIT_SHA=dev
ENV NEXT_PUBLIC_APP_ENV=${APP_ENV} NEXT_PUBLIC_GIT_SHA=${GIT_SHA} NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm run build && rm -rf .next/cache

FROM ${NODE_IMAGE} AS runtime-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM ${NODE_IMAGE}
ARG APP_ENV=prod
ARG GIT_SHA=dev
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 APP_ENV=${APP_ENV} GIT_SHA=${GIT_SHA} \
    FILES_DIR=/data/files WHATSAPP_DIR=/data/whatsapp PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=runtime-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY package.json next.config.ts tsconfig.json ./
COPY src ./src
COPY drizzle ./drizzle
COPY public ./public
RUN mkdir -p /data/files /data/whatsapp && chown -R node:node /data && chmod 700 /data/whatsapp
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]
