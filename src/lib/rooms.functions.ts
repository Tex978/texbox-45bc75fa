import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { SESSION_COOKIE } from "./auth.server";
import { readRooms, writeRooms } from "./rooms.server";
import { roomActionSchema } from "./rooms";
export const roomsGet = createServerFn({ method: "GET" }).handler(async () =>
  readRooms(getCookie(SESSION_COOKIE)),
);
export const roomsChange = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    z.object({ version: z.number().int().nonnegative(), action: roomActionSchema }).parse(v),
  )
  .handler(async ({ data }) => writeRooms(getCookie(SESSION_COOKIE), data.version, data.action));
