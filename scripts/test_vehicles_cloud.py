import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from vehicles_cloud import Account, renault_reading, vw_reading, failure, handle, sessions
from carconnectivity.errors import AuthenticationError
from renault_api.gigya.exceptions import InvalidCredentialsException


class VehicleReadings(unittest.TestCase):
    def test_master_fuel_range_and_odometer(self):
        data = renault_reading("master", SimpleNamespace(fuelQuantity=43, fuelAutonomy=520, totalMileage=12500))
        self.assertEqual((data["fuel"], data["range"], data["odometer"]), (43, 520, 12500))

    def test_missing_master_values_are_not_invented(self):
        self.assertIsNone(renault_reading("master", None)["fuel"])

    def test_vw_battery_range_and_odometer(self):
        attr = lambda v: SimpleNamespace(value=v)
        vehicle = SimpleNamespace(id="id7", vin=attr("id7"), name=attr("ID.7"), odometer=attr(1400),
                                  drives=SimpleNamespace(drives={"electric": SimpleNamespace(level=attr(72), range=attr(410))}),
                                  charging=SimpleNamespace(state=attr(SimpleNamespace(value="charging"))))
        data = vw_reading(vehicle)
        self.assertEqual((data["battery"], data["range"], data["odometer"], data["charging"]), (72, 410, 1400, "charging"))


class VehicleCache(unittest.IsolatedAsyncioTestCase):
    async def test_failed_login_is_cached_for_fifteen_minutes(self):
        sessions.clear()
        cfg = {"brand": "vw"}
        with patch.object(Account, "login", new_callable=AsyncMock) as login:
            login.side_effect = AuthenticationError("Authorization URL could not be fetched due to WeConnect failure")
            first = await handle({"config": cfg})
            second = await handle({"config": cfg})
            self.assertEqual(first, second)
            login.assert_awaited_once()
            self.assertIn("vw/login/authorization_unavailable", first["error"])
        sessions.clear()

    async def test_vw_fetch_does_not_update_twice(self):
        account = Account({"brand": "vw"})
        from unittest.mock import Mock
        connector = SimpleNamespace(update_vehicles=Mock())
        account.client = SimpleNamespace(fetch_all=Mock(), garage=SimpleNamespace(list_vehicles=lambda: []),
                                         connectors=SimpleNamespace(connectors={"vw": connector}))
        await account.read()
        account.client.fetch_all.assert_called_once()
        connector.update_vehicles.assert_not_called()

    async def test_repeated_reads_use_cache(self):
        import time
        account = Account({"brand": "vw"})
        account.cached = {"vehicles": [{"battery": 72}]}
        account.cached_at = time.monotonic()
        account.login = AsyncMock()
        self.assertEqual(await account.read(), {"vehicles": [{"battery": 72}]})
        account.login.assert_not_awaited()

    async def test_code_completes_pending_renault_session(self):
        import time
        account = Account({"brand": "renault"})
        account.pending = True
        async def complete(*args, **kwargs):
            account.cached = {"vehicles": []}
            account.cached_at = time.monotonic()
        account.client = SimpleNamespace(session=SimpleNamespace(complete_two_factor_auth=AsyncMock(side_effect=complete)))
        account.login = AsyncMock()
        # Empty accounts avoid any external reads after verification.
        account.client.get_person = AsyncMock(return_value=SimpleNamespace(accounts=[]))
        result = await account.read("123456")
        self.assertFalse(result["verification"])
        account.client.session.complete_two_factor_auth.assert_awaited_once_with("123456", remember_device=True)


class SafeDiagnostics(unittest.TestCase):
    def test_renault_credentials_are_identified_without_leaking_details(self):
        error = InvalidCredentialsException(403042, "private-password test@example.invalid")
        message = failure(error, "renault", "login")
        self.assertIn("renault/login/credentials", message)
        self.assertNotIn("private-password", message)
        self.assertNotIn("test@example.invalid", message)

    def test_unexpected_error_never_leaks_vendor_text(self):
        self.assertNotIn("secret", failure(ValueError("secret"), "renault", "vehicles"))


if __name__ == "__main__":
    unittest.main()