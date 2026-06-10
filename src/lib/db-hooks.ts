import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
        return id as string;
      }
      const { data, error } = await supabase
        .from(table)
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [table] });
      toast.success("Sikeres mentés");
    },
    onError: (e: any) =>
      toast.error("Mentési hiba", { description: e?.message ?? String(e) }),
  });
}

export function useDelete(table: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [table] });
      toast.success("Törölve");
    },
    onError: (e: any) =>
      toast.error("Törlési hiba", { description: e?.message ?? String(e) }),
  });
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