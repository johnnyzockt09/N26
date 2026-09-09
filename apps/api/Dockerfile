# All-in-one image (Variante C): backend + built frontend + SQLite.
# Single process, one URL - no Netlify, no external database, no CORS.

# Build stage: compile shared, API and the React frontend
FROM node:20-alpine AS build
WORKDIR /workspace

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web

# Build order: shared first (api dist imports @n26/shared), then api, then web.
RUN npm run build -w @n26/shared
RUN npm run build -w @n26/api
RUN npm run build -w @n26/web

# Runtime stage: compiled output + production deps + frontend dist
FROM node:20-alpine AS runtime
WORKDIR /workspace
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev

COPY --from=build /workspace/packages/shared/dist packages/shared/dist
COPY --from=build /workspace/packages/shared/package.json packages/shared/package.json
COPY --from=build /workspace/apps/api/dist apps/api/dist
COPY --from=build /workspace/apps/web/dist apps/web/dist

# argon2 needs the C++ runtime on alpine
RUN apk add --no-cache libstdc++

# SQLite data lives here; persist it via volume ./data:/workspace/data
RUN mkdir -p data

EXPOSE 3000
CMD ["node", "apps/api/dist/index.js"]