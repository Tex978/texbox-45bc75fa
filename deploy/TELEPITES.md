# Telepítés Synologyra

1. Töltsd le a projekt kódját (GitHub-on keresztül), és másold fel a NAS-ra, pl. `/volume1/docker/nas-vezerlo`.
2. Írd át a `deploy/docker-compose.yml` fájlban az IP-címet, a portokat és a kulcsokat.
   - Radarr/Sonarr API kulcs: Settings → General → API Key
   - Plex token: https://support.plex.tv/articles/204059436
   - qBittorrent: WebUI felhasználónév és jelszó
3. Container Manager → Projekt → Létrehozás → útvonal: `/volume1/docker/nas-vezerlo/deploy` → Build és indítás.
4. Nyisd meg: `http://<NAS-IP>:3050`, a Kapcsolatok oldalon látod, mi működik.
