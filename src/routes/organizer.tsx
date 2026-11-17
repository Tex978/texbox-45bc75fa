import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Shell, PageHeader } from "@/components/Shell";
import { Organizer } from "@/components/Organizer";
import { Puzzle } from "lucide-react";

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
      <PageHeader
        title="Családi szervező"
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/games">
              <Puzzle size={16} /> Gyerek játékok
            </Link>
          </Button>
        }
      />
      <Organizer />
    </Shell>
  );
}
