FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache git python3 make g++ && (corepack enable || npm install -g pnpm@9)
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/server ./apps/server
COPY packages/protocol ./packages/protocol
# Seed inicial de objetos del mapa (db.seedObjects) lee apps/web/public en runtime.
COPY apps/web/public ./apps/web/public
RUN pnpm install --frozen-lockfile || pnpm install --no-frozen-lockfile
RUN pnpm --filter @quiiven/protocol build && pnpm --filter @quiiven/server build
EXPOSE 2567
CMD ["node", "apps/server/dist/index.js"]
