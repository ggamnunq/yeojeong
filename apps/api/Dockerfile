# 레포 루트에서 빌드: docker build -f apps/api/Dockerfile -t yeojeong-api .
FROM node:26-alpine AS build
RUN npm install -g pnpm@11.21.0
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile --filter @yeojeong/api...
RUN pnpm --filter @yeojeong/api... build
RUN pnpm --filter @yeojeong/api --config.inject-workspace-packages=true \
    deploy --prod --ignore-scripts /out

FROM node:26-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
