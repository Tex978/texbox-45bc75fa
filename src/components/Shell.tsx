import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMe } from "@/lib/auth.functions";
import { ROLE_LABELS } from "@/lib/permissions";
import { LayoutDashboard, Clapperboard, Search, Download, HardDrive, House, Cable, Server, Film, Play, History, Plus, Menu, Users, LogOut, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
const allNav = [
  { to: "/", label: "Áttekintő", icon: LayoutDashboard }, { to: "/search", label: "Keresés", icon: Search }, { to: "/streaming", label: "Streaming", icon: Clapperboard },
  { to: "/downloads", label: "Letöltések", icon: Download }, { to: "/library", label: "Tárhely", icon: HardDrive },
  { to: "/home", label: "Okosotthon", icon: House }, { to: "/settings", label: "Kapcsolatok", icon: Cable },
] as const;
export const meQuery = { queryKey: ["me"], queryFn: () => getMe(), staleTime: 60_000 } as const;
function ProfileMenu() {
  const { data } = useQuery(meQuery);
  const u = data?.user; if (!u) return null;
  const initials = u.displayName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="app-profile" aria-label={`Profil: ${u.displayName}`}><span className="app-avatar">{initials}</span><span className="app-profile-name">{u.displayName}</span></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-56"><DropdownMenuLabel><div className="font-semibold">{u.displayName}</div><div className="text-xs font-normal text-muted-foreground">@{u.username} · {ROLE_LABELS[u.role]}</div></DropdownMenuLabel><DropdownMenuSeparator />
      {u.can.users && <DropdownMenuItem asChild><Link to="/family" className="min-h-11"><Users />Család és jogosultságok</Link></DropdownMenuItem>}
      <DropdownMenuItem asChild><a href="/__logout" className="min-h-11"><LogOut />Kijelentkezés / fiókváltás</a></DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}
export function Shell({ children, demo, className = "" }: { children: ReactNode; demo?: boolean; className?: string }) {
  const me = useQuery(meQuery).data;
  const nav = allNav.filter((n) => n.to !== "/settings" || !me?.user || me.user.can.settings);
  return <div className={`app-shell min-h-screen bg-background text-foreground ${className}`}>
    <header className="app-header border-b border-border"><div className="app-header-inner">
      <div className="app-brand"><span className="app-brand-icon"><Server size={18} strokeWidth={1.7} /></span><span className="app-brand-name">NAS Vezérlő</span></div>
      {demo && <span className="app-demo">DEMÓ</span>}
      {className.includes("smart-home") && <div className="home-app-menu"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Alkalmazás menü" title="Alkalmazás menü"><Menu /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-52">{nav.map(({to, label, icon: Icon}) => <DropdownMenuItem key={to} asChild><Link to={to} className="min-h-12"><Icon />{label}</Link></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu></div>}
      <div className="app-profile-slot"><ProfileMenu /></div>
      <nav className="app-nav" aria-label="Főmenü">{nav.map(({to, label, icon: Icon}) => <Link key={to} to={to} activeOptions={{exact: true}}><Icon size={17} strokeWidth={1.7} />{label}</Link>)}</nav>
    </div></header>
    <main className="app-main">{children}</main>
  </div>;
}
const titleIcons: Record<string, LucideIcon> = { "Tárhely": HardDrive, "Nemrég nézett": History, "Legutóbb hozzáadva": Plus };
export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  const Icon = title ? titleIcons[title] ?? (title.startsWith("Most nézik") ? Play : Cable) : undefined;
  return <section className={`app-section ${className}`}>
    {title && <h2 className="app-section-title">{Icon && <Icon size={18} strokeWidth={1.7} />}{title}</h2>}{children}
  </section>;
}
export function Bar({ value }: { value: number }) {
  return <div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} /></div>;
}
export function Poster({ src, title }: { src?: string; title: string; hue?: number }) {
  return src ? <img src={src} alt={title} loading="lazy" className="aspect-[2/3] w-full rounded-lg bg-secondary object-cover" />
    : <div className="app-poster-placeholder aspect-[2/3] w-full rounded-lg p-2 text-xs"><Film size={24} strokeWidth={1.2} />{title && <span className="line-clamp-2">{title}</span>}</div>;
}
