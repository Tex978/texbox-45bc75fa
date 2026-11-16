import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader } from "@/components/Shell";
import { Rewards } from "@/components/Rewards";

export const Route = createFileRoute("/rewards")({
  head: () => ({
    meta: [
      { title: "Ajándékbolt – TexBox" },
      {
        name: "description",
        content: "Személyes pontegyenleg, jutalmak beváltása és szülői jóváhagyás a TexBoxban.",
      },
      { property: "og:title", content: "Ajándékbolt – TexBox" },
      { property: "og:description", content: "Saját pontok és családi jutalmak a saját NAS-on." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RewardsPage,
});
function RewardsPage() {
  return (
    <Shell>
      <PageHeader title="Ajándékbolt" subtitle="Saját pontok, jutalmak és beváltások" />
      <Rewards />
    </Shell>
  );
}
