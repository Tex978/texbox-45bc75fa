import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { notificationsUnread } from "@/lib/notifications.functions";

export const unreadQuery = {
  queryKey: ["notifications-unread"],
  queryFn: () => notificationsUnread(),
  retry: false,
  refetchInterval: 30000,
  refetchOnWindowFocus: true,
} as const;
export function NotificationBell() {
  const q = useQuery(unreadQuery);
  const n = q.data?.unread ?? 0;
  return (
    <Link
      to="/notifications"
      className="app-bell"
      aria-label={n ? `Értesítések, ${n} olvasatlan` : "Értesítések"}
    >
      <Bell size={19} strokeWidth={1.8} />
      {n > 0 && <span className="app-bell-count">{n > 99 ? "99+" : n}</span>}
    </Link>
  );
}
