import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/Shell";
import { Dashboard } from "@/components/Dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Főoldal – TexBox családi irányítópult" },
      {
        name: "description",
        content: "Otthon, mai feladatok, családi program, bevásárlás, menü és pontok egy helyen.",
      },
      { property: "og:title", content: "TexBox családi irányítópult" },
      { property: "og:description", content: "Kiegyensúlyozott családi főoldal a saját NAS-on." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});
function Index() {
  return (
    <Shell>
      <Dashboard />
    </Shell>
  );
}
