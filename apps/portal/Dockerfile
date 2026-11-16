FROM node:22-alpine AS build

WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/backend/package.json apps/backend/package.json
COPY apps/portal/package.json apps/portal/package.json
COPY apps/planner/package.json apps/planner/package.json
RUN npm ci --no-audit --no-fund

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/portal apps/portal
COPY apps/planner apps/planner

RUN npm run build -w @casarenous/shared \
  && npm run build:embed -w @casarenous/planner \
  && npm run build -w @casarenous/portal

FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache openssl

COPY apps/portal/nginx/nginx.conf /etc/nginx/nginx.conf
COPY apps/portal/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY apps/portal/nginx/security-headers.conf /etc/nginx/security-headers.conf
COPY apps/portal/nginx/security-headers-embed.conf /etc/nginx/security-headers-embed.conf
COPY apps/portal/nginx/10-casarenous-certs.sh /docker-entrypoint.d/10-casarenous-certs.sh
RUN chmod +x /docker-entrypoint.d/10-casarenous-certs.sh

COPY --from=build /app/apps/portal/dist /usr/share/nginx/html

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
