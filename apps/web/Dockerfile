FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache git && (corepack enable || npm install -g pnpm@9)
# Vite hornea las VITE_* en el build → deben llegar como build args (ver docker-compose.yml).
ARG VITE_COLYSEUS_URL=ws://localhost:2567
ARG VITE_MAP_DEFAULT=/maps/demo.tmj
ARG VITE_PROXIMITY_RADIUS_TILES=5
ARG VITE_AUTH_PROVIDER=none
ARG VITE_API_BASE=http://localhost:2567
ENV VITE_COLYSEUS_URL=$VITE_COLYSEUS_URL VITE_MAP_DEFAULT=$VITE_MAP_DEFAULT VITE_PROXIMITY_RADIUS_TILES=$VITE_PROXIMITY_RADIUS_TILES VITE_AUTH_PROVIDER=$VITE_AUTH_PROVIDER VITE_API_BASE=$VITE_API_BASE
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages/protocol ./packages/protocol
RUN pnpm install --frozen-lockfile || pnpm install --no-frozen-lockfile
RUN pnpm --filter @quiiven/protocol build && pnpm --filter @quiiven/web build
EXPOSE 5173
CMD ["pnpm", "--filter", "@quiiven/web", "preview", "--port", "5173", "--host"]
