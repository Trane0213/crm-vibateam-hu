import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Élő frissítés: ha egy munkatárs módosít egy leadet, ajánlatot,
// utánkövetést, projektet vagy feladatot, a többiek képernyőjén az érintett
// listák automatikusan újratöltődnek. A Supabase RLS miatt mindenki csak a
// számára látható sorokról kap értesítést. Rövid gyűjtés (debounce) után
// táblánként egyszer érvénytelenítünk, hogy ne legyen lekérdezés-vihar.
const TABLE_KEYS: Record<string, string[][]> = {
  leads: [["leads"], ["pipeline"], ["pulse"]],
  quotes: [["quotes"], ["pipeline"], ["pulse"]],
  followups: [["followups"], ["pipeline"], ["pulse"], ["list"]],
  projects: [["projects"], ["list"]],
  tasks: [["tasks"], ["pulse"], ["list"]],
};

export function useRealtimeSync(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const keys = new Map<string, string[]>();
      for (const t of pending) for (const k of TABLE_KEYS[t] ?? []) keys.set(k.join("|"), k);
      pending.clear();
      for (const k of keys.values()) qc.invalidateQueries({ queryKey: k });
      // useListWhere / useLookup kulcsai a tábla nevét tartalmazzák.
      qc.invalidateQueries({
        predicate: (q) => q.queryKey.some((p) => typeof p === "string" && p in TABLE_KEYS && keysTouched.has(p)),
      });
      keysTouched.clear();
    };
    const keysTouched = new Set<string>();
    const channel = supabase.channel(`crm-sync-${Math.random().toString(36).slice(2)}`);
    for (const table of Object.keys(TABLE_KEYS)) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        pending.add(table);
        keysTouched.add(table);
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
