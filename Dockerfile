# NOT BUILT OR RUN where this project was developed (Docker is not installed there). Treat as a starting point and
# build it once before relying on it: docker build -t coilyard . && docker run -p 5722:5722 -e HOST=0.0.0.0 coilyard
FROM node:22-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@11.28.3
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5722 STATIC_DIR=/app/client
WORKDIR /app
COPY --from=build /app/apps/server/dist/main.mjs ./main.mjs
COPY --from=build /app/apps/client/dist ./client
USER node
EXPOSE 5722
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:5722/healthz || exit 1
CMD ["node", "main.mjs"]
