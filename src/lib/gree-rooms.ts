import { useEffect, useState } from "react";

export type GreeRooms = { rooms: string[]; assignments: Record<string, string> };
export const GREE_ROOMS_KEY = "home-gree-rooms";
const empty: GreeRooms = { rooms: [], assignments: {} };
export function parseGreeRooms(raw: string | null): GreeRooms {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || !Array.isArray(value.rooms)) return empty;
    const rooms: string[] = [
      ...new Set<string>(
        value.rooms
          .filter((r: unknown): r is string => typeof r === "string")
          .map((r: string) => r.trim())
          .filter(Boolean),
      ),
    ];
    const assignments = Object.fromEntries(
      Object.entries(value.assignments ?? {}).filter(
        ([id, room]) => id && typeof room === "string" && rooms.includes(room),
      ),
    );
    return { rooms, assignments: assignments as Record<string, string> };
  } catch {
    return empty;
  }
}
export function renameGreeRoom(state: GreeRooms, old: string, name: string): GreeRooms {
  const next = name.trim();
  if (!next || !state.rooms.includes(old)) return state;
  return {
    rooms: [...new Set(state.rooms.map((r) => (r === old ? next : r)))],
    assignments: Object.fromEntries(
      Object.entries(state.assignments).map(([id, room]) => [id, room === old ? next : room]),
    ),
  };
}
export function useGreeRooms() {
  const [state, setState] = useState<GreeRooms>(empty);
  const [error, setError] = useState("");
  useEffect(() => {
    const read = () => {
      try {
        setState(parseGreeRooms(localStorage.getItem(GREE_ROOMS_KEY)));
      } catch {
        setError("A szobabeosztás nem olvasható ebben a böngészőben.");
      }
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("gree-rooms-changed", read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("gree-rooms-changed", read);
    };
  }, []);
  const save = (next: GreeRooms) => {
    try {
      localStorage.setItem(GREE_ROOMS_KEY, JSON.stringify(next));
      setState(next);
      setError("");
      window.dispatchEvent(new Event("gree-rooms-changed"));
    } catch {
      setError("A szobabeosztás mentése nem sikerült. Engedélyezd a böngésző helyi tárolását.");
    }
  };
  return { state, save, error };
}
