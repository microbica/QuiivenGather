FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable || npm install -g pnpm@9
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages/protocol ./packages/protocol
RUN pnpm install --frozen-lockfile || pnpm install --no-frozen-lockfile
RUN pnpm --filter @quiiven/web build
EXPOSE 5173
CMD ["pnpm", "--filter", "@quiiven/web", "preview", "--port", "5173", "--host"]
