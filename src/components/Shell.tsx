import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
const nav = [
  { to: "/", label: "Áttekintő" }, { to: "/search", label: "Keresés" },
  { to: "/downloads", label: "Letöltések" }, { to: "/library", label: "Tárhely" }, { to: "/home", label: "Okosotthon" }, { to: "/settings", label: "Kapcsolatok" },
] as const;
export function Shell({ children, demo, className = "" }: { children: ReactNode; demo?: boolean; className?: string }) {
  return (
    <div className={`min-h-screen bg-background text-foreground ${className}`}>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-4">
          <div className="font-display text-xl font-bold tracking-tight"><span className="text-primary">●</span> NAS Vezérlő</div>
          {demo && <span className="rounded bg-accent px-2 py-0.5 font-mono text-xs text-accent-foreground">DEMÓ</span>}
          <nav className="ml-auto flex flex-wrap gap-1">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} activeOptions={{ exact: true }}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                activeProps={{ className: "bg-secondary !text-foreground" }}>{n.label}</Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-border bg-card p-5 ${className}`}>
      {title && <h2 className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">{title}</h2>}
      {children}
    </section>
  );
}
export function Bar({ value }: { value: number }) {
  return <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} /></div>;
}

export function Poster({ src, title, hue = 30 }: { src?: string; title: string; hue?: number }) {
  return src ? <img src={src} alt={title} loading="lazy" className="aspect-[2/3] w-full rounded-lg bg-secondary object-cover" />
    : <div className="flex aspect-[2/3] items-end rounded-lg p-2 text-sm font-bold" style={{ background: `linear-gradient(160deg, oklch(0.45 0.12 ${hue}), oklch(0.2 0.04 ${hue}))` }}>{title}</div>;
}
