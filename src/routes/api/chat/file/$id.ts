import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/chat/file/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { downloadChatFile, requestToken, fileError } =
          await import("@/lib/chat-files.server");
        try {
          return downloadChatFile(requestToken(request), params.id, request);
        } catch (e) {
          return fileError(e);
        }
      },
      DELETE: async ({ request, params }) => {
        const { deleteChatFile, requestToken, sameOrigin, fileError } =
          await import("@/lib/chat-files.server");
        try {
          sameOrigin(request);
          deleteChatFile(requestToken(request), params.id);
          return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
        } catch (e) {
          return fileError(e);
        }
      },
    },
  },
});
