# Build from the repository root:  docker build -f apps/api/Dockerfile -t saathi-api .
FROM node:22-slim AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build -w @saathi/api
# The two front ends are served by the API itself (one origin: no CORS, and the portal's strict cookie works).
RUN VITE_API_URL= npm run build -w @saathi/web && VITE_API_URL= VITE_BASE=/portal/ npm run build -w @saathi/admin
# Keep only what the running API needs.
RUN npm prune --omit=dev

FROM node:22-slim
ARG GIT_SHA=""
ARG BUILD_TIME=""
ARG APP_VERSION="0.2.0"
ENV NODE_ENV=production GIT_SHA=$GIT_SHA BUILD_TIME=$BUILD_TIME APP_VERSION=$APP_VERSION PORT=8787 STATIC_WEB_DIR=/app/static/web STATIC_ADMIN_DIR=/app/static/admin
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./static/web
COPY --from=build /app/apps/admin/dist ./static/admin
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Run migrations as a release step with:  node apps/api/dist/db/migrate-cli.js   (or set AUTO_MIGRATE=1 to do it at start)
CMD ["node", "apps/api/dist/index.js"]
