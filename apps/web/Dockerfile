# Build stage: compile the React SPA
FROM node:20-alpine AS build
WORKDIR /workspace

# Install all workspace deps first (shared package is a workspace dep)
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci

# Copy sources
COPY packages/shared packages/shared
COPY apps/web apps/web
COPY apps/api apps/api

# Build shared first (web imports @n26/shared from its compiled dist via
# the package "exports"), then build the SPA (tsc + vite).
RUN npm run build -w @n26/shared
RUN npm run build -w @n26/web

# Runtime stage: static nginx
FROM nginx:1.27-alpine
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
