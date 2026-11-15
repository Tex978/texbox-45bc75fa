FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install
COPY . .
RUN NITRO_PRESET=node-server bun run build

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=build /app/.output ./.output
COPY --from=build /app/scripts/gree_cloud.py ./scripts/gree_cloud.py
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv python3-dev build-essential ca-certificates \
    && python3 -m venv /opt/gree \
    && /opt/gree/bin/python -m pip install --no-cache-dir --upgrade pip setuptools wheel \
    && /opt/gree/bin/pip install --no-cache-dir greeclimate-davo22==2.7.5 \
    && /opt/gree/bin/python -c "from greeclimate_davo22.cloud_api import GreeCloudApi; from greeclimate_davo22.cloud_device import CloudDevice; from greeclimate_davo22.cloud_gateway import GreeCloudGateway, uses_mqtt; from greeclimate_davo22.mqtt_client import GreeMqttClient" \
    && apt-get purge -y --auto-remove python3-dev build-essential \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --no-save --omit=dev gree-hvac-client@2.2.0
RUN mkdir -p /data
VOLUME /data
ENV PORT=3050 HOST=0.0.0.0 NODE_ENV=production
EXPOSE 3050
CMD ["node", ".output/server/index.mjs"]
