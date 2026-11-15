"""Private vehicle bridge: credentials on stdin, sanitized readings on stdout."""
import asyncio
import contextlib
import hashlib
import json
import logging
import sys
import time
from datetime import datetime, timezone

import aiohttp
from carconnectivity.carconnectivity import CarConnectivity
from renault_api.renault_client import RenaultClient
from renault_api.gigya.exceptions import PendingTwoFactorAuthenticationException

logging.disable(logging.CRITICAL)
INTERVAL = 900
sessions = {}


def number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def attribute(obj, name):
    return getattr(getattr(obj, name, None), "value", None)


def vw_reading(vehicle):
    drives = getattr(getattr(vehicle, "drives", None), "drives", {})
    drive = next(iter(drives.values()), None)
    charging = attribute(getattr(vehicle, "charging", None), "state")
    return {"id": str(attribute(vehicle, "vin") or vehicle.id),
            "name": str(attribute(vehicle, "name") or "Volkswagen"),
            "battery": number(attribute(drive, "level")), "fuel": None,
            "range": number(attribute(drive, "range")),
            "odometer": number(attribute(vehicle, "odometer")),
            "charging": getattr(charging, "value", None)}


def renault_reading(vin, cockpit):
    return {"id": vin, "name": "Renault", "battery": None,
            "fuel": number(getattr(cockpit, "fuelQuantity", None)),
            "range": number(getattr(cockpit, "fuelAutonomy", None)),
            "odometer": number(getattr(cockpit, "totalMileage", None)), "charging": None}


class Account:
    def __init__(self, cfg):
        self.cfg = cfg
        self.client = None
        self.http = None
        self.pending = False
        self.cached = None
        self.cached_at = 0

    async def login(self):
        if self.client is not None:
            return
        if self.cfg["brand"] == "vw":
            self.client = CarConnectivity({"carConnectivity": {"connectors": [{"type": "volkswagen", "config": {
                "username": self.cfg["user"], "password": self.cfg["password"], "interval": INTERVAL}}]}})
        else:
            self.http = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=45))
            self.client = RenaultClient(websession=self.http, locale=self.cfg.get("locale") or "hu_HU")
            try:
                await self.client.session.login(self.cfg["user"], self.cfg["password"])
            except PendingTwoFactorAuthenticationException:
                await self.client.session.request_two_factor_auth_code()
                self.pending = True

    async def read(self, code=None):
        if code and self.pending:
            await self.client.session.complete_two_factor_auth(code, remember_device=True)
            self.pending = False
            self.cached = None
        if self.pending:
            return {"vehicles": [], "error": "", "verification": True, "updatedAt": None}
        if self.cached is not None and time.monotonic() - self.cached_at < INTERVAL:
            return self.cached
        await self.login()
        if self.pending:
            return {"vehicles": [], "error": "", "verification": True, "updatedAt": None}
        vehicles = []
        if self.cfg["brand"] == "vw":
            # No background polling thread: fetch only through this bounded read path.
            await asyncio.to_thread(self.client.fetch_all)
            vehicles = [vw_reading(v) for v in self.client.garage.list_vehicles()]
        else:
            person = await self.client.get_person()
            for entry in person.accounts or []:
                if not entry.accountId:
                    continue
                account = await self.client.get_api_account(entry.accountId)
                response = await account.get_vehicles()
                for record in response.vehicleLinks or []:
                    vin = record.vin
                    if not vin:
                        continue
                    vehicle = await account.get_api_vehicle(vin)
                    try:
                        cockpit = await vehicle.get_cockpit()
                        vehicles.append(renault_reading(vin, cockpit))
                    except Exception:
                        vehicles.append({**renault_reading(vin, None), "error": "Az autó nem adott át műszerfaladatokat."})
        self.cached = {"vehicles": vehicles, "error": "", "verification": False,
                       "updatedAt": datetime.now(timezone.utc).isoformat()}
        self.cached_at = time.monotonic()
        return self.cached

    async def close(self):
        if self.http:
            await self.http.close()
        elif self.client:
            with contextlib.suppress(Exception):
                await asyncio.to_thread(self.client.shutdown)


async def handle(req):
    cfg = req["config"]
    key = hashlib.sha256(json.dumps(cfg, sort_keys=True).encode()).hexdigest()
    account = sessions.get(key)
    if account is None:
        account = Account(cfg)
        sessions[key] = account
    try:
        return await account.read(req.get("code"))
    except Exception:
        if account.pending:
            return {"vehicles": [], "error": "Az ellenőrzőkód nem fogadható el. Ellenőrizd, és próbáld újra.", "verification": True, "updatedAt": None}
        # Cache failures too: repeated refreshes must not repeatedly log in.
        account.cached = {"vehicles": [], "error": "Az autós kapcsolat sikertelen. Ellenőrizd a fiókot, a régiót és az aktív online szolgáltatást.",
                          "verification": False, "updatedAt": None}
        account.cached_at = time.monotonic()
        await account.close()
        account.client = None
        account.http = None
        return account.cached


async def main():
    try:
        while True:
            line = await asyncio.to_thread(sys.stdin.readline)
            if not line:
                break
            req = json.loads(line)
            try:
                result = await asyncio.wait_for(handle(req), 150)
                reply = {"id": req["id"], "result": result}
            except Exception:
                reply = {"id": req["id"], "error": "Az autós lekérdezés nem fejeződött be."}
            print(json.dumps(reply, ensure_ascii=False), flush=True)
    finally:
        for account in sessions.values():
            await account.close()


if __name__ == "__main__":
    asyncio.run(main())