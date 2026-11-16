import { Baby, Bike, Cat, Dog, Heart, Leaf, Moon, Music, Rocket, Star, Sun } from "lucide-react";
import { DEFAULT_AVATAR, type Avatar } from "@/lib/profile-schema";

const ICONS = {
  child: Baby,
  star: Star,
  cat: Cat,
  dog: Dog,
  heart: Heart,
  sun: Sun,
  moon: Moon,
  leaf: Leaf,
  rocket: Rocket,
  music: Music,
  bike: Bike,
} as const;
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

export function UserAvatar({
  name,
  avatar,
  size = 32,
}: {
  name: string;
  avatar?: Partial<Avatar> | null;
  size?: number;
}) {
  const a = { ...DEFAULT_AVATAR, ...(avatar ?? {}) };
  const Icon = a.icon === "initials" ? null : ICONS[a.icon as keyof typeof ICONS];
  return (
    <span
      className={`app-avatar avatar-${a.color}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {Icon ? <Icon size={Math.round(size * 0.55)} /> : initialsOf(name)}
    </span>
  );
}
