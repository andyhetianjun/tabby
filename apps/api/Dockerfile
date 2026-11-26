FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
# Only install what the API needs (the mobile app is not part of this image).
RUN npm ci -w @tabby/api -w @tabby/core --include-workspace-root=false
COPY packages/core packages/core
COPY apps/api apps/api
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["npx", "tsx", "src/server.ts"]
