import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/gmail/send")({
  server: { handlers: { POST: async ({ request }) => {
    const { handleGmailSend } = await import("@/lib/gmail/send.server");
    return handleGmailSend(request);
  } } },
});
