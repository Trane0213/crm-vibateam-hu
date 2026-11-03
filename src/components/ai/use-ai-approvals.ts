import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { decideAiAction, getAiActions } from "@/lib/ai-os/runtime.functions";
import type { Thread, ToolApproval } from "./chat-shared";
import { useQueryClient } from '@tanstack/react-query';

type Commit = (update: (threads: Thread[]) => Thread[]) => void;
export function useAiApprovals(threads: Thread[], activeId: string | null, commit: Commit) {
 const qc=useQueryClient();
 const decide = useServerFn(decideAiAction);
 const read = useServerFn(getAiActions);
 const [checking, setChecking] = useState(false);
 const inFlight = useRef(new Set<string>());
 const reconciled = useRef(new Set<string>());
 function update(tid: string, mid: string, cid: string, change: Partial<ToolApproval>) {
  commit(prev => prev.map(t => t.id !== tid ? t : { ...t, messages: t.messages.map(m => m.id !== mid ? m : { ...m, approvals: m.approvals?.map(a => a.tool_call_id === cid ? { ...a, ...change } : a) }) }));
 }
 useEffect(() => {
  const thread = threads.find(t => t.id === activeId);
  const cards = thread?.messages.flatMap(m => (m.approvals ?? []).filter(a => a.action_id && (!reconciled.current.has(a.action_id) || a.status === "executing")).map(a => ({ m, a }))) ?? [];
  if (!thread || !cards.length) return;
  let cancelled = false;
  const refresh = async () => {
   try {
    const result = await read({ data: { actionIds: cards.map(c => c.a.action_id).filter((id): id is string => !!id).slice(0, 100) } });
    if (cancelled) return;
    for (const row of result) {
     const card = cards.find(c => c.a.action_id === row.action_id);
     if (card) { reconciled.current.add(row.action_id); update(thread.id, card.m.id, card.a.tool_call_id, { ...row, verified: true, transportError: undefined }); }
    }
   } catch {
    if (!cancelled) for (const { m, a } of cards) update(thread.id, m.id, a.tool_call_id, { verified: false, transportError: "Az állapot ellenőrzése sikertelen." });
   }
  };
  const timer = setTimeout(refresh, 0);
  const poll = cards.some(c => c.a.status === "executing") ? setInterval(refresh, 5000) : undefined;
  return () => { cancelled = true; clearTimeout(timer); if (poll) clearInterval(poll); };
 // Reconcile on opening and while executing, not during unrelated local edits.
 }, [activeId, threads.map(t => t.messages.flatMap(m => m.approvals?.map(a => `${a.action_id}:${a.status}:${a.verified}`) ?? []).join()).join()]);

 async function act(msgId: string, callId: string, decision: "approve" | "reject" | "check", confirmation?: string) {
  const thread = threads.find(t => t.id === activeId);
  const card = thread?.messages.find(m => m.id === msgId)?.approvals?.find(a => a.tool_call_id === callId);
  if (!thread || !card?.action_id || inFlight.current.has(card.action_id)) return;
  if (decision !== "check" && (!card.verified || card.status !== "pending")) return;
  const id = card.action_id;
  inFlight.current.add(id); setChecking(true);
  update(thread.id, msgId, callId, { submitting: true });
  try {
   const result = await decide({ data: { actionId: id, decision, confirmation } });
   reconciled.current.add(id);
   update(thread.id, msgId, callId, { ...result, submitting: false, verified: true, transportError: undefined });
   if(result.status==='succeeded'&&['sales_record_prep_activity','sales_update_next_step','sales_create_followup','sales_set_lead_contact','sales_reassign_lead'].includes(result.tool_name)) {
    for(const key of ['leads','pipeline','quotes','followups','activities','activity','company-activity'])void qc.invalidateQueries({queryKey:[key]});
   }
   if (decision === "approve" && result.status === "succeeded") toast.success(result.no_op ? "Már a kívánt állapotban volt; nem történt új módosítás." : "A művelet sikeresen végrehajtva.");
   else if (result.status === "failed" || result.status === "unknown") toast.error(result.error ?? "A végrehajtás eredménye még nem igazolt.");
  } catch {
   update(thread.id, msgId, callId, { submitting: false, verified: false, transportError: "A végrehajtás eredménye még nem igazolt. Ellenőrizd az állapotot." });
  } finally { inFlight.current.delete(id); setChecking(false); }
 }
 return { act, checking };
}