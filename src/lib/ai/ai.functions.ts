import { createServerFn } from "@tanstack/react-start";
import { aiChat, DEFAULT_MODEL, type AiToolDef } from "@/lib/ai/provider.server";

/** Egyszerű szöveges completion — tool-calling nélkül. */
export const aiComplete = createServerFn({ method: "POST" })
  .inputValidator((input: { messages: any[]; model?: string }) => input)
  .handler(async ({ data }) => {
    const res = await aiChat(data.messages, data.model ?? DEFAULT_MODEL);
    return { text: res.text };
  });

/** Egyetlen LLM lépés tool-hívással. Kliens oldal futtatja a toolokat,
 *  és az eredményeket következő körben visszaküldi a messages-ben.
 *  Visszatér: text (asszisztens szöveg) és tool_calls (ha van). */
export const aiStep = createServerFn({ method: "POST" })
  .inputValidator((input: { messages: any[]; tools?: AiToolDef[]; model?: string }) => input)
  .handler(async ({ data }) => {
    const res = await aiChat(data.messages, data.model ?? DEFAULT_MODEL, data.tools);
    return res;
  });