import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  TRAIN_COLORS,
  WAGON_ALLATIVE,
  WAGON_NAME,
  isCargoFull,
  isCorrectStation,
  makeCargoTarget,
  makeTrain,
  pickStations,
  type Station,
  type Train,
} from "@/lib/train-game";

const MODES = [
  { id: "station", label: "🚉 Állomások" },
  { id: "cargo", label: "📦 Kocsi rakodása" },
] as const;

const LEVELS = [
  { stations: 3, wagons: 3, label: "Könnyű" },
  { stations: 4, wagons: 4, label: "Közepes" },
  { stations: 5, wagons: 5, label: "Nehezebb" },
];

const ROUNDS = 5;
const NEXT_DELAY_MS = 1600;

type Mode = (typeof MODES)[number]["id"];

export function TrainGame() {
  const [mode, setMode] = useState<Mode>("station");
  const [level, setLevel] = useState(0);
  const [round, setRound] = useState(1);
  const [train, setTrain] = useState<Train | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [target, setTarget] = useState(1);
  const [loaded, setLoaded] = useState(0);
  const [msg, setMsg] = useState("Várunk a vonatra!");
  const [locked, setLocked] = useState(false);
  const [finished, setFinished] = useState(false);

  // Shuffle after mount so the server and the browser render the same first frame.
  useEffect(() => {
    startGame(mode, level);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function nextTrain(l: number) {
    const t = makeTrain(Math.random, LEVELS[l]!.wagons);
    setTrain(t);
    setStations(pickStations(t, LEVELS[l]!.stations, Math.random));
    const want = makeCargoTarget(Math.random, LEVELS[l]!.wagons);
    setTarget(want);
    setLoaded(0);
    setLocked(false);
    setMsg(
      mode === "station"
        ? "Melyik állomásra menjen a vonat?"
        : `Rakj ${want} ${WAGON_NAME}t a vonatba!`,
    );
  }

  function startGame(m: Mode, l: number) {
    setMode(m);
    setLevel(l);
    setRound(1);
    setFinished(false);
    nextTrain(l);
  }

  function advance() {
    if (round >= ROUNDS) {
      setFinished(true);
      setMsg("🎉 Ügyes vagy! Megvan az összes vonat!");
      return;
    }
    setRound((r) => r + 1);
    nextTrain(level);
  }

  function tapStation(s: Station) {
    if (!train || locked) return;
    if (isCorrectStation(train, s)) {
      setLocked(true);
      setMsg(`Igen! A vonat ${TRAIN_COLORS[train.colorIndex]!.allative} ment! 👏`);
      setTimeout(advance, NEXT_DELAY_MS);
    } else {
      setMsg("Az nem jó állomás, próbáld újra! 🙂");
    }
  }

  function loadWagon() {
    if (locked || isCargoFull(target, loaded)) return;
    const n = loaded + 1;
    setLoaded(n);
    if (isCargoFull(target, n)) {
      setLocked(true);
      setMsg("Megvan a kocsik száma! 🚂");
      setTimeout(advance, NEXT_DELAY_MS);
    } else {
      setMsg(`${n} ${WAGON_NAME} – még kell!`);
    }
  }

  const color = train ? TRAIN_COLORS[train.colorIndex]! : null;
  const cols =
    stations.length >= 5 ? "grid-cols-2 sm:grid-cols-3" : stations.length === 4 ? "grid-cols-2" : "grid-cols-3";

  return (
    <section className="train-game space-y-4">
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <Button
            key={m.id}
            size="lg"
            variant={mode === m.id ? "default" : "outline"}
            onClick={() => startGame(m.id, level)}
          >
            {m.label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {LEVELS.map((l, i) => (
          <Button
            key={l.label}
            variant={level === i ? "default" : "outline"}
            onClick={() => startGame(mode, i)}
          >
            {l.label}
          </Button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        {round}. / {ROUNDS}. vonat
      </p>
      <p className="min-h-10 text-xl font-semibold" aria-live="polite">
        {msg}
      </p>

      {color && (
        <div className="train-strip" role="img" aria-label={`Színes vonat ${train?.wagons ?? 0} kocsival`}>
          <span className="train-engine">🚂</span>
          {Array.from({ length: train?.wagons ?? 0 }).map((_, i) => (
            <span key={i} className="train-wagon" style={{ background: color.hex }} />
          ))}
        </div>
      )}

      {mode === "station" ? (
        <div className={`grid max-w-xl gap-3 ${cols}`}>
          {stations.map((s) => (
            <button
              key={s.colorIndex}
              type="button"
              onClick={() => tapStation(s)}
              aria-label={`${s.label} állomás`}
              className="train-station"
              style={{ background: s.hex }}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="train-count" aria-hidden="true">
            {Array.from({ length: target }).map((_, i) => (
              <span key={i} className={i < loaded ? "train-slot train-slot-full" : "train-slot"} />
            ))}
          </div>
          <Button size="lg" disabled={locked} onClick={loadWagon}>
            📦 Rakj egy kocsit!
          </Button>
        </div>
      )}

      {finished && (
        <Button size="lg" onClick={() => startGame(mode, level)}>
          Új játék
        </Button>
      )}
    </section>
  );
}
