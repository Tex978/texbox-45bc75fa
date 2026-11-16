import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader } from "@/components/Shell";
import { ProfilePage } from "@/components/Profile";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Saját profil és eszközeim – TexBox" },
      { name: "description", content: "Saját név, profilikon, jelszó és bejelentkezett eszközök kezelése a TexBoxban." },
      { property: "og:title", content: "Saját profil – TexBox" },
      { property: "og:description", content: "Saját profil, jelszó és aktív eszközök." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <Shell>
      <div className="mx-auto grid max-w-3xl gap-6">
        <PageHeader title="Saját profil" subtitle="Név, profilikon, jelszó és bejelentkezett eszközök." />
        <ProfilePage />
      </div>
    </Shell>
  ),
});
