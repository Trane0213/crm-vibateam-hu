import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { toast } from "sonner";
import { PROJECT_STATUS, PROJECT_STATUS_TONE, PROJECT_STATUS_LABEL } from "@/lib/viba-constants";

export function ProjectStatusSelect({ projectId, value }: { projectId: string; value: string | null | undefined }) {
  const qc = useQueryClient();
  const current = value ?? "uj_megkereses";
  const tone = PROJECT_STATUS_TONE[current] ?? "";
  const mut = useMutation({
    mutationFn: async (next: string) => {
      const { error } = await supabase.from("projects").update({ status: next }).eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Státusz frissítve");
    },
    onError: (e: any) => toast.error("Mentés sikertelen", { description: humanizeSupabaseError(e) }),
  });
  return (
    <Select value={current} onValueChange={(v) => mut.mutate(v)} disabled={mut.isPending}>
      <SelectTrigger className={`h-8 w-[180px] border ${tone}`}>
        <SelectValue>{PROJECT_STATUS_LABEL[current] ?? current}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {PROJECT_STATUS.map((s) => (
          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}