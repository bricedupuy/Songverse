# Builds the NestJS API and BullMQ worker from the same image — only the
# CMD entrypoint differs at deploy time (see docker-compose.yml / Dokploy
# service definitions: api runs `node dist/main.js`, worker runs
# `node dist/worker.js`).
FROM node:22-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages/tsconfig packages/tsconfig
COPY packages/core packages/core
COPY packages/db packages/db
COPY apps/api apps/api
RUN pnpm --filter @songverse/core build \
 && pnpm --filter @songverse/db build \
 && pnpm --filter @songverse/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/packages /repo/packages
COPY --from=build /repo/apps/api /repo/apps/api
WORKDIR /repo/apps/api
EXPOSE 3001
CMD ["node", "dist/main.js"]
