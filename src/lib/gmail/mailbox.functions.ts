import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/middleware";
import type { Mailbox, MailboxPage } from "./mailbox-model";

export const getMailboxes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { data, error } = await context.supabase.rpc("crm_mailboxes");
    if (error) throw new Error(error.message);
    return data as Mailbox[];
  });

export const getMailboxPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    mailbox: z.string().email().nullable(),
    folder: z.enum(["inbox", "sent", "waiting", "auto", "all", "unread"]),
    search: z.string().max(200), page: z.number().int().min(0).max(100000),
  }))
  .handler(async ({ context, data: input }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { data, error } = await context.supabase.rpc("crm_mailbox_page", {
      p_mailbox: input.mailbox, p_folder: input.folder, p_search: input.search, p_page: input.page,
    });
    if (error) throw new Error(error.message);
    return data as MailboxPage;
  });