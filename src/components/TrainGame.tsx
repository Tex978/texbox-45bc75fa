import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { makeRoute, type Passenger } from "@/lib/train-game";

const STOPS = 5;
type Phase = "waiting" | "driving" | "boarded" | "done";

export function TrainGame() {
  const [route, setRoute] = useState<Passenger[]>([]);
  const [stop, setStop] = useState(0);
  const [riders, setRiders] = useState<Passenger[]>([]);
  const [phase, setPhase] = useState<Phase>("waiting");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = () => {
    if (timer.current) clearTimeout(timer.current);
    setRoute(makeRoute(STOPS));
    setStop(0);
    setRiders([]);
    setPhase("waiting");
  };
  useEffect(() => {
    reset();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const current = route[stop];
  const go = () => {
    if (phase === "driving" || phase === "done") return;
    if (phase === "boarded") {
      // leave the station, next animal appears
      if (stop + 1 >= route.length) {
        setPhase("done");
        return;
      }
      setStop((s) => s + 1);
      setPhase("waiting");
      return;
    }
    setPhase("driving");
    timer.current = setTimeout(() => {
      if (current) setRiders((r) => [...r, current]);
      setPhase("boarded");
    }, 1400);
  };

  const atStation = phase === "boarded";
  const msg =
    phase === "done"
      ? "Megérkeztünk! Mindenki felszállt! 🎉"
      : phase === "boarded" && current
        ? `${current.sound} Felszállt a ${current.name}! Nyomd meg, és mehetünk tovább!`
        : phase === "driving"
          ? "Csú-csú! 🚂"
          : current
            ? `A ${current.name} vár az állomáson. Nyomd meg a gombot!`
            : "";

  return (
    <section className="space-y-4">
      <p className="text-lg font-medium" aria-live="polite">{msg}</p>
      <div className="relative h-40 overflow-hidden rounded-xl border bg-muted">
        {/* station */}
        {phase !== "done" && current && (
          <div className="absolute right-4 bottom-8 flex flex-col items-center">
            <span className={`text-5xl transition-opacity ${atStation ? "opacity-0" : "opacity-100"}`}>
              {current.emoji}
            </span>
            <span className="rounded bg-background px-2 text-xs">🚉 {stop + 1}. állomás</span>
          </div>
        )}
        {/* train */}
        <div
          className="absolute bottom-6 flex items-end gap-1 text-4xl transition-[left] duration-[1400ms] ease-in-out"
          style={{ left: phase === "driving" || atStation ? "calc(100% - 9rem - " + riders.length * 2.75 + "rem)" : "1rem" }}
        >
          {[...riders].reverse().map((r) => (
            <span key={r.name} className="rounded-md bg-background px-1">{r.emoji}</span>
          ))}
          <span className="inline-block -scale-x-100">🚂</span>
        </div>
        <div className="absolute inset-x-0 bottom-4 h-1 bg-foreground/30" />
      </div>
      {phase === "done" ? (
        <Button size="lg" className="h-16 w-full text-xl" onClick={reset}>Új utazás 🚂</Button>
      ) : (
        <Button size="lg" className="h-16 w-full text-xl" onClick={go} disabled={phase === "driving"}>
          {phase === "boarded" ? "Tovább! 🚂" : "Indulj, vonat! 🚂"}
        </Button>
      )}
      <p className="text-sm text-muted-foreground">Utasok: {riders.map((r) => r.emoji).join(" ") || "még senki"}</p>
    </section>
  );
}
