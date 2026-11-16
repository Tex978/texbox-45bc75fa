import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMe } from "@/lib/auth.functions";
import { ROLE_LABELS } from "@/lib/permissions";
import {
  LayoutDashboard,
  Clapperboard,
  Search,
  Download,
  HardDrive,
  House,
  Cable,
  Server,
  Film,
  Play,
  History,
  Plus,
  Menu,
  Users,
  ClipboardList,
  LogOut,
  MoreHorizontal,
  UserRound,
  RefreshCw,
  AlertCircle,
  Gift,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
const allNav = [
  { to: "/", label: "Áttekintő", icon: LayoutDashboard },
  { to: "/search", label: "Keresés", icon: Search },
  { to: "/downloads", label: "Letöltések", icon: Download },
  { to: "/library", label: "Tárhely", icon: HardDrive },
  { to: "/home", label: "Okosotthon", icon: House },
  { to: "/tasks", label: "Feladatok", icon: ClipboardList },
  { to: "/rewards", label: "Ajándékbolt", icon: Gift },
  { to: "/settings", label: "Kapcsolatok", icon: Cable },
] as const;
const primaryTabs: string[] = ["/", "/search", "/downloads", "/home"];
export const meQuery = {
  queryKey: ["me"],
  queryFn: () => getMe(),
  staleTime: 0,
  refetchInterval: 60_000,
  retry: false,
} as const;
export function ProfileMenu() {
  const { data, error, isPending, refetch } = useQuery(meQuery);
  const u = data?.user;
  if (!u) {
    if (data?.mode === "accounts")
      return (
        <Button variant="outline" size="sm" asChild>
          <a href="/__login">Belépés</a>
        </Button>
      );
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="app-profile" aria-label="Fiók állapota">
            <span className="app-avatar">
              {error || data?.mode === "unavailable" ? (
                <AlertCircle size={18} />
              ) : (
                <UserRound size={18} />
              )}
            </span>
            <span className="app-profile-name">{isPending ? "Fiók betöltése…" : "Fiók"}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-w-80">
          <DropdownMenuLabel className="whitespace-normal font-normal">
            {error
              ? "A munkamenet ellenőrzése sikertelen. Próbáld újra, vagy lépj be a NAS-címeden."
              : data?.mode === "unavailable"
                ? "A NAS fióktárolója nem olvasható. A hozzáférés biztonsági okból szünetel."
                : data?.mode === "preview"
                  ? "Az előnézet nem éri el a NAS családi fiókjait."
                  : isPending
                    ? "Munkamenet ellenőrzése…"
                    : "Még nincs aktív családi belépés."}
          </DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={() => {
              void refetch();
            }}
          >
            <RefreshCw />
            Újraellenőrzés
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/family">
              <Users />
              Család és fiókok
            </Link>
          </DropdownMenuItem>
          {(error || data?.mode === "unavailable") && (
            <DropdownMenuItem asChild>
              <a href="/__login">Belépés</a>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  const initials = u.displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="app-profile" aria-label={`Profil: ${u.displayName}`}>
          <span className="app-avatar">{error ? <AlertCircle size={18} /> : initials}</span>
          <span className="app-profile-name">{u.displayName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>
          <div className="font-semibold">{u.displayName}</div>
          <div className="text-xs font-normal text-muted-foreground">
            @{u.username} · {ROLE_LABELS[u.role]}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {error && (
          <>
            <DropdownMenuLabel className="max-w-72 whitespace-normal font-normal text-destructive">
              A munkamenet ellenőrzése sikertelen; az utolsó ismert profilt látod.
            </DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => {
                void refetch();
              }}
            >
              <RefreshCw />
              Újraellenőrzés
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/__login">Új belépés</a>
            </DropdownMenuItem>
          </>
        )}
        {u.can.family && (
          <DropdownMenuItem asChild>
            <Link to="/family" className="min-h-11">
              <Users />
              Család és jogosultságok
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <a href="/__logout" className="min-h-11">
            <LogOut />
            Kijelentkezés / fiókváltás
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export function Shell({
  children,
  demo,
  className = "",
}: {
  children: ReactNode;
  demo?: boolean;
  className?: string;
}) {
  const me = useQuery(meQuery).data;
  const nav = allNav.filter((n) => n.to !== "/settings" || !me?.user || me.user.can.settings);
  return (
    <div className={`app-shell min-h-screen bg-background text-foreground ${className}`}>
      <a href="#main-content" className="app-skip-link">
        Ugrás a tartalomra
      </a>
      <header className="app-header border-b border-border">
        <div className="app-header-inner">
          <div className="app-brand">
            <span className="app-brand-icon">
              <Server size={18} strokeWidth={1.7} />
            </span>
            <span className="app-brand-name">NAS Vezérlő</span>
          </div>
          {demo && <span className="app-demo">DEMÓ</span>}
          {className.includes("smart-home") && (
            <div className="home-app-menu">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Alkalmazás menü"
                    title="Alkalmazás menü"
                  >
                    <Menu />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-52">
                  {nav.map(({ to, label, icon: Icon }) => (
                    <DropdownMenuItem key={to} asChild>
                      <Link to={to} className="min-h-12">
                        <Icon />
                        {label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                  {(!me?.user || me.user.can.family) && (
                    <DropdownMenuItem asChild>
                      <Link to="/family" className="min-h-12">
                        <Users />
                        Család és fiókok
                      </Link>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          <div className="app-profile-slot">
            <ProfileMenu />
          </div>
          <nav className="app-nav" aria-label="Főmenü">
            {nav.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} activeOptions={{ exact: true }}>
                <Icon size={17} strokeWidth={1.7} />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="app-main">
        {children}
      </main>
      {!className.includes("smart-home") && (
        <nav className="app-tabbar" aria-label="Gyors menü">
          {nav
            .filter((n) => primaryTabs.includes(n.to))
            .map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} activeOptions={{ exact: true }}>
                <Icon size={22} strokeWidth={1.8} />
                <span>{label}</span>
              </Link>
            ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" type="button" aria-label="További oldalak">
                <MoreHorizontal size={22} strokeWidth={1.8} />
                <span>Több</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="min-w-56">
              {nav
                .filter((n) => !primaryTabs.includes(n.to))
                .map(({ to, label, icon: Icon }) => (
                  <DropdownMenuItem key={to} asChild>
                    <Link to={to} className="min-h-12">
                      <Icon />
                      {label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              {(!me?.user || me.user.can.family) && (
                <DropdownMenuItem asChild>
                  <Link to="/family" className="min-h-12">
                    <Users />
                    Család
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      )}
    </div>
  );
}
const titleIcons: Record<string, LucideIcon> = {
  Tárhely: HardDrive,
  "Nemrég nézett": History,
  "Legutóbb hozzáadva": Plus,
};
export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const Icon = title
    ? (titleIcons[title] ?? (title.startsWith("Most nézik") ? Play : Cable))
    : undefined;
  return (
    <section className={`app-section ${className}`}>
      {title && (
        <h2 className="app-section-title">
          {Icon && <Icon size={18} strokeWidth={1.7} />}
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
export function Bar({ value }: { value: number }) {
  const percent = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <div
      role="progressbar"
      aria-label="Előrehaladás"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="h-1.5 overflow-hidden rounded-full bg-secondary"
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
    </div>
  );
}
export function Poster({ src, title }: { src?: string; title: string; hue?: number }) {
  return src ? (
    <img
      src={src}
      alt={title}
      loading="lazy"
      className="aspect-[2/3] w-full rounded-lg bg-secondary object-cover"
    />
  ) : (
    <div className="app-poster-placeholder aspect-[2/3] w-full rounded-lg p-2 text-xs">
      <Film size={24} strokeWidth={1.2} />
      {title && <span className="line-clamp-2">{title}</span>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="min-w-0">
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
export function EmptyState({
  icon: Icon = Film,
  title,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">
        <Icon size={22} strokeWidth={1.6} />
      </span>
      <p className="font-medium">{title}</p>
      {children && <div className="text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
