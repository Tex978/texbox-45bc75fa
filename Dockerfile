FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install
COPY . .
RUN NITRO_PRESET=node-server bun run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/.output ./.output
COPY --from=build /app/scripts/gree_cloud.py ./scripts/gree_cloud.py
RUN apk add --no-cache python3 py3-pip \
    && apk add --no-cache --virtual .gree-build gcc musl-dev python3-dev \
    && python3 -m venv /opt/gree \
    && /opt/gree/bin/pip install --no-cache-dir greeclimate-davo22==2.7.5 \
    && apk del .gree-build
RUN npm install --no-save --omit=dev gree-hvac-client@2.2.0
ENV PORT=3050 HOST=0.0.0.0 NODE_ENV=production
EXPOSE 3050
CMD ["node", ".output/server/index.mjs"]
