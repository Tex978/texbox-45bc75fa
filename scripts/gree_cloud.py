"""Private JSON-lines bridge for the self-hosted Gree+ integration.

Credentials arrive only on stdin; stdout contains sanitized device state.
"""
import asyncio
import contextlib
import hashlib
import json
import logging
import sys
import time

from greeclimate_davo22.cloud_api import GreeCloudApi
from greeclimate_davo22.cloud_device import CloudDevice
from greeclimate_davo22.cloud_gateway import GreeCloudGateway, uses_mqtt
from greeclimate_davo22.deviceinfo import DeviceInfo
from greeclimate_davo22.mqtt_client import GreeMqttClient

logging.disable(logging.CRITICAL)
MODES = {"auto": 0, "cool": 1, "dry": 2, "fan_only": 3, "heat": 4}
FANS = {"auto": 0, "low": 1, "mediumLow": 2, "medium": 3, "mediumHigh": 4, "high": 5}
sessions = {}


class Account:
    def __init__(self, cfg):
        self.api = GreeCloudApi.for_server(cfg["region"], cfg["user"], cfg["password"])
        self.region = cfg["region"]
        self.mqtt = None
        self.gateway = GreeCloudGateway(self.api, timeout=8)
        self.records = {}
        self.devices = {}
        self.cache = None
        self.cached_at = 0
        self.discovered_at = 0

    async def discover(self):
        if self.records and time.monotonic() - self.discovered_at < 900:
            return
        records = await self.api.get_all_devices()
        self.records = {r.mac: r for r in records}
        self.discovered_at = time.monotonic()

    async def device(self, record):
        if record.mac in self.devices:
            return self.devices[record.mac]
        if uses_mqtt(record.version) and self.mqtt is None:
            self.mqtt = GreeMqttClient(self.api.user_id, self.api.token, server=GreeMqttClient.server_for_region(self.region))
            await asyncio.wait_for(self.mqtt.connect(), 12)
        info = DeviceInfo("", 7000, record.mac, record.name, model=record.model, version=record.version)
        device = CloudDevice(self.mqtt, info, record.key, gateway=self.gateway,
                             parent_mac=record.parent_mac, timeout=8, command_timeout=8)
        await asyncio.wait_for(device.bind(), 22)
        self.devices[record.mac] = device
        return device

    def state(self, record, device):
        props = {}
        if device.power is not None:
            props["power"] = "on" if device.power else "off"
        if device.target_temperature is not None:
            props["temperature"] = device.target_temperature
        if device.mode is not None:
            props["mode"] = next((k for k, v in MODES.items() if v == device.mode), "")
        if device.fan_speed is not None:
            props["fanSpeed"] = next((k for k, v in FANS.items() if v == device.fan_speed), "")
        return {"ip": record.mac, "name": record.name, "online": True, "properties": props, "error": ""}

    async def read(self):
        if self.cache is not None and time.monotonic() - self.cached_at < 60:
            return self.cache
        await self.discover()
        units = []
        for record in self.records.values():
            try:
                device = await self.device(record)
                await asyncio.wait_for(device.update_state(), 12)
                units.append(self.state(record, device))
            except Exception:
                self.devices.pop(record.mac, None)
                units.append({"ip": record.mac, "name": record.name, "online": False,
                              "properties": {}, "error": "A klíma nem válaszolt a Gree+ kapcsolaton."})
        self.cache = {"configured": True, "units": units, "error": ""}
        self.cached_at = time.monotonic()
        return self.cache

    async def control(self, command):
        await self.discover()
        record = self.records.get(command["ip"])
        if record is None:
            raise ValueError("Ez a klíma nem található a Gree+ fiókban.")
        device = await self.device(record)
        prop, value = command["property"], command["value"]
        if prop == "power":
            opts, vals = ["Pow"], [1 if value == "on" else 0]
        elif prop == "mode":
            opts, vals = ["Mod"], [MODES[value]]
        elif prop == "fanSpeed":
            opts, vals = ["WdSpd"], [FANS[value]]
        elif prop == "temperature":
            # The library expects Props enums, not strings, for get_property.
            # Its setters also keep decimal setpoints synchronized on models
            # that report SetDeciTem even with HalfTemEn disabled.
            device.temperature_units = 0
            device.target_temperature = value
        else:
            raise ValueError("Érvénytelen klímabeállítás.")
        self.cache = None
        if prop == "temperature":
            await asyncio.wait_for(device.push_state_update(), 12)
        else:
            await asyncio.wait_for(device.send_command(opts, vals), 12)
        await asyncio.wait_for(device.update_state(), 12)
        actual = self.state(record, device)["properties"].get(prop)
        if actual != value:
            raise ValueError("A klíma nem igazolta vissza a kért beállítást. Frissítsd az állapotát.")
        return {"ok": True}

    async def close(self):
        if self.mqtt:
            with contextlib.suppress(Exception):
                await self.mqtt.disconnect()
        await self.api.close()


async def handle(req):
    cfg = req["config"]
    key = hashlib.sha256(json.dumps(cfg, sort_keys=True).encode()).hexdigest()
    account = sessions.get(key)
    if account is None:
        account = Account(cfg)
        try:
            await account.api.login()
        except Exception:
            await account.close()
            raise ValueError("Gree+ belépés sikertelen. Ellenőrizd az e-mailt, a jelszót és a régiót.")
        sessions[key] = account
    if req["action"] == "control":
        return await account.control(req["command"])
    return await account.read()


async def main():
    try:
        while True:
            line = await asyncio.to_thread(sys.stdin.readline)
            if not line:
                break
            req = json.loads(line)
            try:
                result = await asyncio.wait_for(handle(req), 170)
                response = {"id": req["id"], "result": result}
            except ValueError as exc:
                response = {"id": req["id"], "error": str(exc)}
            except Exception:
                response = {"id": req["id"], "error": "A Gree+ kapcsolat nem válaszolt. Próbáld újra később."}
            print(json.dumps(response, ensure_ascii=False), flush=True)
    finally:
        for account in sessions.values():
            await account.close()


if __name__ == "__main__":
    asyncio.run(main())