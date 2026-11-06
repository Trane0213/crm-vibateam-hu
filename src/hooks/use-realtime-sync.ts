import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Élő frissítés: ha egy munkatárs módosít egy leadet, ajánlatot,
// utánkövetést, projektet vagy feladatot, a többiek képernyőjén az érintett
// listák automatikusan újratöltődnek. Az RLS miatt mindenki csak a számára
// látható sorokról kap értesítést. Rövid gyűjtés után egyszer frissítünk
// (nincs lekérdezés-vihar), és csak az aktív (képernyőn lévő) lekérdezéseket.
const TABLES = ["leads", "quotes", "followups", "projects", "tasks", "emails", "email_threads", "quote_sends", "phone_calls", "companies", "contacts", "email_campaigns", "email_campaign_recipients"] as const;
const EXTRA_KEYS: Record<string, string[]> = {
  leads: ["pipeline", "pulse", "sales-watch", "mkt-home", "campaign-list"],
  quotes: ["pipeline", "pulse", "sales-watch"],
  followups: ["pipeline", "pulse", "sales-watch", "mkt-home"],
  emails: ["sales-watch", "mkt-home"],
  email_threads: ["sales-watch", "mkt-home"],
  phone_calls:["mkt-home"],
  companies:["mkt-home","campaign-list","customers","web-request-intake","campaign-draft","email_campaign_recipients"],
  contacts:["mkt-home","campaign-list","web-request-intake"],
  quote_sends: ["sales-watch"],
  projects: [],
  tasks: ["pulse", "mkt-home"],
  email_campaigns: ['email_campaign_recipients'],
  email_campaign_recipients: [],
};

export function useRealtimeSync(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const touched = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const names = new Set<string>();
      for (const t of touched) { names.add(t); for (const k of EXTRA_KEYS[t] ?? []) names.add(k); }
      touched.clear();
      qc.invalidateQueries({
        refetchType: "active",
        predicate: (q) => q.queryKey.some((p) => typeof p === "string" && names.has(p)),
      });
    };
    const channel = supabase.channel(`crm-sync-${Math.random().toString(36).slice(2)}`);
    for (const table of TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        touched.add(table);
        if (!timer) timer = setTimeout(flush, 600);
      });
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [enabled, qc]);
}

