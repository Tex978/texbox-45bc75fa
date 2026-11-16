import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader } from "@/components/Shell";
import { Organizer } from "@/components/Organizer";

export const Route = createFileRoute("/organizer")({
  head: () => ({
    meta: [
      { title: "Családi szervező – TexBox" },
      {
        name: "description",
        content: "Közös bevásárlólista, családi receptek és heti menü a saját NAS-on.",
      },
      { property: "og:title", content: "Családi szervező – TexBox" },
      {
        property: "og:description",
        content: "Bevásárlás, receptek és heti menütervező a családnak.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrganizerPage,
});
function OrganizerPage() {
  return (
    <Shell>
      <PageHeader title="Családi szervező" />
      <Organizer />
    </Shell>
  );
}
