import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { buildDeck, type MemoryCard } from "@/lib/memory-game";

const LEVELS = [
  { pairs: 3, label: "Könnyű (6 kártya)" },
  { pairs: 4, label: "Közepes (8 kártya)" },
  { pairs: 6, label: "Nehezebb (12 kártya)" },
];

export function MemoryGame() {
  const [pairs, setPairs] = useState(3);
  const [deck, setDeck] = useState<MemoryCard[]>([]);
  const [open, setOpen] = useState<number[]>([]);
  const [found, setFound] = useState<string[]>([]);
  const [last, setLast] = useState<string | null>(null);

  const start = (p = pairs) => {
    setPairs(p);
    setDeck(buildDeck(p));
    setOpen([]);
    setFound([]);
    setLast(null);
  };
  useEffect(() => start(3), []); // shuffle after mount to avoid SSR mismatch

  useEffect(() => {
    if (open.length !== 2) return;
    const [a, b] = open.map((i) => deck[i]);
    if (!a || !b) return;
    if (a.emoji === b.emoji) {
      setFound((f) => [...f, a.emoji]);
      setLast(a.name);
      setOpen([]);
      return;
    }
    const t = setTimeout(() => setOpen([]), 1100);
    return () => clearTimeout(t);
  }, [open, deck]);

  const flip = (i: number) => {
    if (open.length >= 2 || open.includes(i) || found.includes(deck[i]?.emoji ?? "")) return;
    setOpen((o) => [...o, i]);
  };
  const won = deck.length > 0 && found.length === deck.length / 2;
  const cols = deck.length === 12 ? "grid-cols-3 sm:grid-cols-4" : deck.length === 8 ? "grid-cols-4" : "grid-cols-3";

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {LEVELS.map((l) => (
          <Button key={l.pairs} variant={pairs === l.pairs ? "default" : "outline"} onClick={() => start(l.pairs)}>
            {l.label}
          </Button>
        ))}
      </div>
      <p className="min-h-8 text-xl font-semibold" aria-live="polite">
        {won ? "🎉 Ügyes vagy! Megtaláltad az összes állatot!" : last ? `Igen! Ez a ${last}! 👏` : "Fordíts meg két kártyát, és keresd a párokat!"}
      </p>
      <div className={`grid max-w-xl gap-3 ${cols}`}>
        {deck.map((c, i) => {
          const shown = open.includes(i) || found.includes(c.emoji);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => flip(i)}
              aria-label={shown ? c.name : "Lefordított kártya"}
              className={`flex aspect-square items-center justify-center rounded-2xl border-2 text-5xl shadow-sm transition-transform active:scale-95 sm:text-6xl ${
                shown ? "border-primary bg-card" : "border-transparent bg-primary text-primary-foreground"
              } ${found.includes(c.emoji) ? "opacity-70" : ""}`}
            >
              {shown ? c.emoji : "?"}
            </button>
          );
        })}
      </div>
      {won && (
        <Button size="lg" onClick={() => start()}>
          Új játék
        </Button>
      )}
    </section>
  );
}
