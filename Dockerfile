FROM node:22-bookworm-slim AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build

ARG LDXP_COMMIT_SHA=unknown
ARG LDXP_VERSION=0.1.0
ARG LDXP_IMAGE=ldxp-price-board:local

ENV LDXP_COMMIT_SHA=${LDXP_COMMIT_SHA}
ENV LDXP_VERSION=${LDXP_VERSION}
ENV LDXP_IMAGE=${LDXP_IMAGE}

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ARG LDXP_COMMIT_SHA=unknown
ARG LDXP_VERSION=0.1.0
ARG LDXP_IMAGE=ldxp-price-board:local

ENV NODE_ENV=production
ENV PORT=4177
ENV HOST=0.0.0.0
ENV LDXP_DEPLOY_MODE=container
ENV LDXP_DATA_DIR=/app/data
ENV LDXP_COMMIT_SHA=${LDXP_COMMIT_SHA}
ENV LDXP_VERSION=${LDXP_VERSION}
ENV LDXP_IMAGE=${LDXP_IMAGE}

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server ./server
COPY scripts ./scripts

RUN mkdir -p /app/data /app/diagnostics && chown -R node:node /app

USER node
EXPOSE 4177

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4177) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/index.js"]
