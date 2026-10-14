FROM node:22-alpine
WORKDIR /app
RUN corepack enable || npm install -g pnpm@9
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/server ./apps/server
COPY packages/protocol ./packages/protocol
RUN pnpm install --frozen-lockfile || pnpm install --no-frozen-lockfile
RUN pnpm --filter @quiiven/server build
EXPOSE 2567
CMD ["node", "apps/server/dist/index.js"]
