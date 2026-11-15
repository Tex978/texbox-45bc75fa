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
