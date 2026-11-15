FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install
COPY . .
RUN NITRO_PRESET=node-server bun run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/.output ./.output
ENV PORT=3050 HOST=0.0.0.0 NODE_ENV=production
EXPOSE 3050
CMD ["node", ".output/server/index.mjs"]
