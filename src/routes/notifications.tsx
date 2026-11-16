import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader } from "@/components/Shell";
import { Notifications } from "@/components/Notifications";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Értesítések – TexBox" },
      {
        name: "description",
        content: "Személyes jóváhagyások, emlékeztetők és jutalmak a TexBoxban.",
      },
      { property: "og:title", content: "Értesítések – TexBox" },
      { property: "og:description", content: "Családi értesítési központ a saját NAS-on." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsPage,
});
function NotificationsPage() {
  return (
    <Shell>
      <PageHeader title="Értesítések" subtitle="Saját jóváhagyások, emlékeztetők és jutalmak" />
      <Notifications />
    </Shell>
  );
}
