export const volumes = [
  { name: "Volume 1 (Filmek)", used: 7.4, total: 10 },
  { name: "Volume 2 (Sorozatok)", used: 5.1, total: 8 },
];
export const streams = [
  { user: "Apa", title: "Dűne: Második rész", device: "Samsung TV", quality: "4K HDR", mode: "Direct Play", progress: 62 },
  { user: "Anna", title: "The Bear – S03E04", device: "iPhone", quality: "1080p → 720p", mode: "Transcode", progress: 28 },
];
export const recent = [
  { title: "Oppenheimer", year: 2023, type: "Film", hue: 30 },
  { title: "Shōgun", year: 2024, type: "Sorozat", hue: 0 },
  { title: "Civil War", year: 2024, type: "Film", hue: 200 },
  { title: "Fallout", year: 2024, type: "Sorozat", hue: 90 },
  { title: "Poor Things", year: 2023, type: "Film", hue: 320 },
  { title: "Severance", year: 2022, type: "Sorozat", hue: 170 },
];
export type Torrent = { id: number; name: string; size: string; progress: number; down: number; up: number; eta: string; paused: boolean };
export const torrents: Torrent[] = [
  { id: 1, name: "Gladiator.II.2024.2160p.WEB-DL", size: "18.2 GB", progress: 74, down: 12.4, up: 1.1, eta: "6 perc", paused: false },
  { id: 2, name: "Slow.Horses.S04.1080p.WEB", size: "9.6 GB", progress: 31, down: 8.2, up: 0.4, eta: "14 perc", paused: false },
  { id: 3, name: "The.Wild.Robot.2024.1080p", size: "4.3 GB", progress: 100, down: 0, up: 2.3, eta: "Kész", paused: false },
  { id: 4, name: "Andor.S02.2160p.DSNP", size: "42.0 GB", progress: 8, down: 0, up: 0, eta: "—", paused: true },
];
export const catalog = [
  { title: "Interstellar", year: 2014, type: "Film" }, { title: "Inception", year: 2010, type: "Film" },
  { title: "Breaking Bad", year: 2008, type: "Sorozat" }, { title: "The Last of Us", year: 2023, type: "Sorozat" },
  { title: "Dune", year: 2021, type: "Film" }, { title: "Dark", year: 2017, type: "Sorozat" },
  { title: "Blade Runner 2049", year: 2017, type: "Film" }, { title: "True Detective", year: 2014, type: "Sorozat" },
];
export const library = [
  { id: 1, title: "Avatar: A víz útja", year: 2022, type: "Film", size: 62.1e9, added: "2023-03-02", poster: "" },
  { id: 2, title: "Game of Thrones", year: 2011, type: "Sorozat", size: 412.5e9, added: "2021-06-11", poster: "" },
  { id: 3, title: "Oppenheimer", year: 2023, type: "Film", size: 48.3e9, added: "2024-01-20", poster: "" },
  { id: 4, title: "Friends", year: 1994, type: "Sorozat", size: 188.0e9, added: "2020-11-30", poster: "" },
  { id: 5, title: "Shrek", year: 2001, type: "Film", size: 7.9e9, added: "2019-08-14", poster: "" },
];
export const haDemo = [
  { entity_id: "sensor.growatt_aktualis_teljesitmeny", state: "3420", attributes: { friendly_name: "Napelem – jelenlegi termelés", unit_of_measurement: "W", device_class: "power" } },
  { entity_id: "sensor.growatt_mai_termeles", state: "18.6", attributes: { friendly_name: "Napelem – mai termelés", unit_of_measurement: "kWh", device_class: "energy" } },
  { entity_id: "sensor.growatt_ossz_termeles", state: "8412", attributes: { friendly_name: "Napelem – összes termelés", unit_of_measurement: "kWh", device_class: "energy" } },
  { entity_id: "light.nappali", state: "on", attributes: { friendly_name: "Nappali lámpa (Tuya)" } },
  { entity_id: "switch.tapo_kavefozo", state: "off", attributes: { friendly_name: "Kávéfőző (Tapo)" } },
  { entity_id: "cover.nappali_redony", state: "open", attributes: { friendly_name: "Nappali redőny" } },
  { entity_id: "cover.haloszoba_redony", state: "closed", attributes: { friendly_name: "Hálószoba redőny" } },
  { entity_id: "vacuum.xiaomi_porszivo", state: "docked", attributes: { friendly_name: "Xiaomi porszívó" } },
  { entity_id: "media_player.samsung_tv", state: "on", attributes: { friendly_name: "Samsung TV" } },
  { entity_id: "sensor.bosch_mosogatogep", state: "Run", attributes: { friendly_name: "Bosch mosogatógép" } },
];
