# The production image: the bundle the quality gate built, the generated migrations, and nothing
# else. Base images are pinned by digest with their version in the tag (scripts/check/dockerfile.ts
# D2), at the Bun release the gate runs (D3).

FROM oven/bun:1.4.2@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895 AS build
WORKDIR /app

# Dependencies first, for the layer cache. Install scripts stay off: nothing here needs one.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
RUN bun run build

# The runtime holds no package manager cache, no sources and no dev tooling: the bundle carries its
# dependencies, so node_modules never reaches this stage.
FROM oven/bun:1.4.2-slim@sha256:cb3bbbb08e13a4a2ff400f24c7a2a1d5efa83f6ef8544d52d95a519631e2fc61 AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000

# Owned by root and only readable by the app's user: the process cannot rewrite its own code.
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/src/db/migrations ./src/db/migrations

USER bun
EXPOSE 3000
CMD ["bun", "dist/index.js"]
