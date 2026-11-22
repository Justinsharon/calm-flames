# syntax=docker/dockerfile:1
# Production image for Cloud Run: builds the Vite storefront and bundles the Express server,
# then runs it on Node 22 with production dependencies only. No secrets are baked in: Cloud Run
# provides them as env vars from Secret Manager at runtime.

# ---- build stage ----
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
USER node
# Cloud Run sets PORT (default 8080); the server reads process.env.PORT.
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist-server/server.js"]
