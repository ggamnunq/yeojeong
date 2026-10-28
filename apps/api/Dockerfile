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
# 실행에 필요 없는 패키지, 다른 DB용 Prisma 런타임, 소스맵을 뺀다
RUN node apps/api/scripts/prune-deps.mjs /out \
 && find /out/node_modules/.pnpm -path '*/@prisma/client/runtime/*' \
      \( -name '*.mysql.*' -o -name '*.sqlite.*' -o -name '*.sqlserver.*' -o -name '*.cockroachdb.*' \) -delete \
 && find /out -name '*.map' -type f -delete

FROM node:26-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
