import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader } from "@/components/Shell";
import { Tasks } from "@/components/Tasks";

export const Route = createFileRoute("/tasks")({
  head: () => ({ meta: [
    { title: "Feladatok – TexBox" },
    { name: "description", content: "Saját és közös családi teendők, ismétlődő feladatok és szülői jóváhagyás a TexBoxban." },
    { property: "og:title", content: "Családi feladatok – TexBox" },
    { property: "og:description", content: "Mentett családi teendők és követhető teljesítések a saját NAS-on." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: TasksPage,
});
function TasksPage() { return <Shell><PageHeader title="Feladatok" subtitle="Saját teendők, közös vállalások és családi teljesítések" /><Tasks /></Shell>; }