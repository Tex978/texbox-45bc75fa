import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from gree_cloud import Account
from greeclimate_davo22.cloud_device import CloudDevice
from greeclimate_davo22.deviceinfo import DeviceInfo


class CloudControls(unittest.IsolatedAsyncioTestCase):
    async def temperature_device(self, properties, value):
        account = Account.__new__(Account)
        account.cache = {"old": True}
        account.discover = AsyncMock()
        account.records = {"aabbcc112233": SimpleNamespace(mac="aabbcc112233", name="Cascade")}
        device = CloudDevice(None, DeviceInfo("", 7000, "aabbcc112233", "Cascade"), "0123456789abcdef")
        device._properties = dict(properties)
        device.send_command = AsyncMock()
        async def readback():
            device._properties = {**properties, "SetTem": value, "TemUn": 0, "TemRec": 0}
            if "SetDeciTem" in properties:
                device._properties["SetDeciTem"] = value * 10
        device.update_state = AsyncMock(side_effect=readback)
        account.device = AsyncMock(return_value=device)
        result = await account.control({"ip": "aabbcc112233", "property": "temperature", "value": value})
        self.assertEqual(result, {"ok": True})
        device.update_state.assert_awaited_once()
        self.assertIsNone(account.cache)
        return device

    async def test_whole_degree_temperature_uses_real_library(self):
        device = await self.temperature_device({"SetTem": 22, "TemRec": 0, "TemUn": 0}, 24)
        device.send_command.assert_awaited_once_with(["SetTem", "TemRec"], [24, 0])

    async def test_decimal_temperature_stays_synced_without_half_degree_flag(self):
        device = await self.temperature_device({"SetTem": 22, "TemRec": 0, "TemUn": 0, "HalfTemEn": 0, "SetDeciTem": 220}, 25)
        device.send_command.assert_awaited_once_with(["SetTem", "TemRec", "SetDeciTem"], [25, 0, 250])

    async def test_half_degree_capable_device_receives_complete_group(self):
        device = await self.temperature_device({"SetTem": 22, "TemRec": 1, "TemUn": 0, "HalfTemEn": 1, "SetDeciTem": 225}, 23)
        device.send_command.assert_awaited_once_with(["SetTem", "TemRec", "SetDeciTem", "TemSen"], [23, 0, 230, 0])

    async def test_command_is_verified_by_readback(self):
        account = Account.__new__(Account)
        account.cache = {"old": True}
        account.discover = AsyncMock()
        account.records = {"aabbcc112233": SimpleNamespace(mac="aabbcc112233", name="Smart One")}
        device = SimpleNamespace(power=True, target_temperature=24, mode=1, fan_speed=0,
                                 get_property=lambda _: None, send_command=AsyncMock(), update_state=AsyncMock())
        account.device = AsyncMock(return_value=device)
        result = await account.control({"ip": "aabbcc112233", "property": "power", "value": "on"})
        self.assertEqual(result, {"ok": True})
        device.send_command.assert_awaited_once_with(["Pow"], [1])
        device.update_state.assert_awaited_once()
        self.assertIsNone(account.cache)
        with self.assertRaisesRegex(ValueError, "nem igazolta"):
            await account.control({"ip": "aabbcc112233", "property": "power", "value": "off"})

    async def test_unknown_device_never_receives_command(self):
        account = Account.__new__(Account)
        account.discover = AsyncMock()
        account.records = {}
        account.device = AsyncMock()
        with self.assertRaisesRegex(ValueError, "nem található"):
            await account.control({"ip": "aabbcc112233", "property": "power", "value": "on"})
        account.device.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()