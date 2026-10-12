FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN --mount=type=secret,id=npm_proxy --mount=type=secret,id=corporate_ca \
    if [ -s /run/secrets/npm_proxy ]; then export HTTPS_PROXY="$(cat /run/secrets/npm_proxy)" HTTP_PROXY="$(cat /run/secrets/npm_proxy)"; fi; \
    if [ -s /run/secrets/corporate_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/corporate_ca; fi; \
    npm install --global pnpm@11.19.0

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=secret,id=npm_proxy --mount=type=secret,id=corporate_ca \
    if [ -s /run/secrets/npm_proxy ]; then export HTTPS_PROXY="$(cat /run/secrets/npm_proxy)" HTTP_PROXY="$(cat /run/secrets/npm_proxy)"; fi; \
    if [ -s /run/secrets/corporate_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/corporate_ca; fi; \
    pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts
RUN pnpm run build

FROM base AS production
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=secret,id=npm_proxy --mount=type=secret,id=corporate_ca \
    if [ -s /run/secrets/npm_proxy ]; then export HTTPS_PROXY="$(cat /run/secrets/npm_proxy)" HTTP_PROXY="$(cat /run/secrets/npm_proxy)"; fi; \
    if [ -s /run/secrets/corporate_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/corporate_ca; fi; \
    pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist ./dist
COPY agent ./agent
COPY web ./web
COPY fixtures ./fixtures
RUN chmod -R a+rX dist agent web fixtures && chmod a+r package.json pnpm-lock.yaml pnpm-workspace.yaml && mkdir -p out && chown node:node out
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
