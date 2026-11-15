import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from gree_cloud import Account


class CloudControls(unittest.IsolatedAsyncioTestCase):
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