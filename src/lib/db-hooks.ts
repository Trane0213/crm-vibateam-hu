import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-log";

/** Supabase / PostgREST / R2 hibák emberi nyelvű (magyar) üzenetté formálása. */
export function humanizeSupabaseError(e: any): string {
  if (!e) return "Ismeretlen hiba történt.";
  const code = e?.code ?? e?.status ?? "";
  const msg = String(e?.message ?? e?.error_description ?? e?.error ?? e ?? "");
  const m = msg.toLowerCase();
  if (code === "PGRST116" || /no rows/.test(m)) return "Nincs találat.";
  if (code === "23505" || /duplicate key/.test(m)) return "Már létezik egy rekord ezekkel az adatokkal.";
  if (code === "23503" || /foreign key/.test(m)) return "Hivatkozott rekord nem található vagy használatban van.";
  if (code === "23502" || /null value/.test(m)) return "Kötelező mező hiányzik.";
  if (code === "42501" || /permission denied|not authorized/.test(m)) return "Nincs jogosultságod ehhez a művelethez.";
  if (code === "42P01" || /does not exist/.test(m)) return "A kért tábla vagy oszlop nem található.";
  if (/jwt|invalid token|not authenticated|auth session/.test(m)) return "A munkamenet lejárt. Jelentkezz be újra.";
  if (/network|failed to fetch|fetch failed/.test(m)) return "Hálózati hiba. Ellenőrizd a kapcsolatot.";
  if (/row-level security|rls/.test(m)) return "A művelet nem engedélyezett (RLS).";
  // Üzleti invariáns triggerek emberi nyelvű fordítása
  if (/projects_protect_won_lead|won_lead/.test(m))
    return "Ez a lead már megnyert projekthez van kötve — a kapcsolat nem módosítható.";
  if (/uq_projects_lead_id/.test(m))
    return "Ehhez a leadhez már létezik projekt. Egy leadből csak egy projekt jöhet létre.";
  if (/won_requires_project/.test(m))
    return "A megnyert státuszhoz projekt szükséges — használd a „Megnyertük” gombot a pipeline-on.";
  if (/next_step_required/.test(m))
    return "A pipeline-fázishoz kötelező megadni a következő lépést (típus + dátum).";
  if (/lost_reason_required|lost_stage_required/.test(m))
    return "Az „Elveszett” státuszhoz kötelező megadni az okot és a fázist.";
  return msg || "Ismeretlen hiba történt.";
}

export function useList<T = any>(
  table: string,
  opts?: { order?: string; ascending?: boolean; select?: string },
) {
  const order = opts?.order ?? "created_at";
  const ascending = opts?.ascending ?? false;
  const select = opts?.select ?? "*";
  return useQuery({
    queryKey: [table, "list", select, order, ascending],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .order(order, { ascending });
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

/** Lista egy adott oszlop = érték szűréssel (pl. project_id = ...). */
export function useListWhere<T = any>(
  table: string,
  column: string,
  value: string | number | null | undefined,
  opts?: { order?: string; ascending?: boolean; select?: string; enabled?: boolean },
) {
  const order = opts?.order ?? "created_at";
  const ascending = opts?.ascending ?? false;
  const select = opts?.select ?? "*";
  const enabled = (opts?.enabled ?? true) && value != null && value !== "";
  return useQuery({
    queryKey: [table, "where", column, value, select, order, ascending],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .eq(column, value as any)
        .order(order, { ascending });
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

export function useRefOptions(table: string, labelColumn: string) {
  return useQuery({
    queryKey: [table, "ref-options", labelColumn],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select(`id, ${labelColumn}`)
        .order(labelColumn, { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        value: r.id as string,
        label: (r[labelColumn] as string) ?? "—",
      }));
    },
  });
}

/**
 * Mint a useRefOptions, csak több oszlopot tölt be és egyedi formázót használ.
 * Hasznos pl. ajánlat választóhoz: `v{version} · {status}` formátum.
 */
export function useRefOptionsRich(
  table: string,
  columns: string[],
  format: (row: any) => string,
  orderColumn?: string,
) {
  const cols = Array.from(new Set(["id", ...columns]));
  const order = orderColumn ?? "created_at";
  return useQuery({
    queryKey: [table, "ref-options-rich", cols.join(","), order],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select(cols.join(","))
        .order(order, { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        value: r.id as string,
        label: format(r) || "—",
      }));
    },
  });
}

export function useUpsert(table: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, any>) => {
      const { id, ...rest } = values;
      // strip undefined to avoid clobbering defaults
      const payload: Record<string, any> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (v !== undefined) payload[k] = v === "" ? null : v;
      }
      if (id) {
        const { error } = await supabase.from(table).update(payload).eq("id", id);
        if (error) throw error;
        logActivity(table, "update", id as string, summarize(payload));
        return id as string;
      }
      const { data, error } = await supabase
        .from(table)
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      logActivity(table, "create", data.id as string, summarize(payload));
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [table] });
      toast.success("Sikeres mentés");
    },
    onError: (e: any) =>
      toast.error("Mentési hiba", { description: humanizeSupabaseError(e) }),
  });
}

export function useDelete(table: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
      logActivity(table, "delete", id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [table] });
      toast.success("Törölve");
    },
    onError: (e: any) =>
      toast.error("Törlési hiba", { description: humanizeSupabaseError(e) }),
  });
}

/** Csak a fontos / üzleti mezőket emeli ki a payloadból a naplónak. */
function summarize(payload: Record<string, any>): Record<string, any> {
  const keep = [
    "title", "name", "subject", "status", "amount", "total_amount",
    "due_date", "meeting_date", "project_id", "company_id", "contact_id",
    "lead_id", "quote_id", "version", "from_email", "to_email", "completed",
  ];
  const out: Record<string, any> = {};
  for (const k of keep) if (k in payload) out[k] = payload[k];
  return out;
}

export function useCount(
  table: string,
  build?: (q: any) => any,
  key: string = "all",
) {
  return useQuery({
    queryKey: [table, "count", key],
    queryFn: async () => {
      let q: any = supabase.from(table).select("*", { count: "exact", head: true });
      if (build) q = build(q);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useAggregateSum(
  table: string,
  column: string,
  build?: (q: any) => any,
  key: string = "all",
) {
  return useQuery({
    queryKey: [table, "sum", column, key],
    queryFn: async () => {
      let q: any = supabase.from(table).select(column);
      if (build) q = build(q);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).reduce(
        (acc: number, r: any) => acc + (Number(r[column]) || 0),
        0,
      );
    },
  });
}