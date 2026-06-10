import { createServerFn } from "@tanstack/react-start";
import { aiChat, DEFAULT_MODEL, type AiMessage } from "@/lib/ai/provider.server";

export const aiComplete = createServerFn({ method: "POST" })
  .inputValidator((input: { messages: AiMessage[]; model?: string }) => input)
  .handler(async ({ data }) => {
    const text = await aiChat(data.messages, data.model ?? DEFAULT_MODEL);
    return { text };
  });