import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader } from "@/components/Shell";
import { MemoryGame } from "@/components/MemoryGame";

export const Route = createFileRoute("/games")({
  head: () => ({
    meta: [
      { title: "Gyerek játékok – TexBox" },
      {
        name: "description",
        content: "Háziállatos memóriajáték kicsiknek, 3–4 éves kortól.",
      },
      { property: "og:title", content: "Gyerek játékok – TexBox" },
      {
        property: "og:description",
        content: "Egyszerű, nagy kártyás memóriajáték 3–4 éveseknek.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GamesPage,
});
function GamesPage() {
  return (
    <Shell>
      <PageHeader title="Gyerek játékok" />
      <h2 className="mb-3 text-lg font-semibold">Háziállat memória</h2>
      <MemoryGame />
    </Shell>
  );
}
