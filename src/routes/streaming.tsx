import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/streaming")({
  beforeLoad: () => {
    throw redirect({
      to: "/search",
      search: { view: "streaming" },
      replace: true,
      statusCode: 301,
    });
  },
});
