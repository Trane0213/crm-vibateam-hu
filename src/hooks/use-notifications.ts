import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { NotificationRow } from "@/lib/notifications/model";

const COLS = "id,category,severity,requires_decision,title,body,link_path,occurrences,created_at,last_occurred_at,resolved_at,audience_user";
export const NOTIF_KEY = "crm-notifications";

/** Láthatóság kizárólag RLS szerint (címzett szerepkör/felhasználó + a forrásrekord láthatósága). */
export type NotificationFilter = { category?: string; decisionOnly?: boolean; openOnly?: boolean };

export function useNotifications(page = 0, pageSize = 30, filter: NotificationFilter = {}) {
  return useQuery({
    queryKey: [NOTIF_KEY, page, pageSize, filter.category ?? "", !!filter.decisionOnly, !!filter.openOnly],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const me = u.user?.id;
      const from = page * pageSize;
      // Szűrés lapozás ELŐTT, a szerveren — a számok és lapok így pontosak.
      let q = supabase.from("crm_notifications").select(COLS, { count: "exact" });
      if (filter.category) q = q.eq("category", filter.category);
      if (filter.decisionOnly) q = q.eq("requires_decision", true);
      if (filter.openOnly) q = q.is("resolved_at", null);
      const list = await q.order("last_occurred_at", { ascending: false }).order("id").range(from, from + pageSize - 1);
      if (list.error) throw new Error("Az értesítések nem tölthetők be.");
      const rows = (list.data ?? []) as NotificationRow[];
      const ids = rows.map((r) => r.id);
      const reads = ids.length ? await supabase.from("crm_notification_reads").select("notification_id").in("notification_id", ids) : { data: [], error: null };
      if (reads.error) throw new Error("Az olvasottsági állapot nem tölthető be.");
      return { rows, total: list.count ?? 0, read: new Set((reads.data ?? []).map((r) => r.notification_id as string)), me };
    },
    staleTime: 30_000,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Nincs bejelentkezve.");
      const { error } = await supabase.from("crm_notification_reads").upsert(ids.map((id) => ({ notification_id: id, user_id: u.user!.id })), { onConflict: "notification_id,user_id", ignoreDuplicates: true });
      if (error) throw new Error("Az olvasottnak jelölés nem sikerült.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [NOTIF_KEY] }),
  });
}
