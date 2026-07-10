import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  deleteConstitutionRule,
  listConstitutionRules,
  upsertConstitutionRule,
  type ConstitutionRule,
} from "@/lib/google-ads/status.functions";

export function GoogleAdsConstitutionEditor() {
  const qc = useQueryClient();
  const list = useServerFn(listConstitutionRules);
  const upsert = useServerFn(upsertConstitutionRule);
  const del = useServerFn(deleteConstitutionRule);

  const q = useQuery({
    queryKey: ["google-ads", "constitution"],
    queryFn: () => list(),
  });

  const upsertM = useMutation({
    mutationFn: (r: Partial<ConstitutionRule>) => upsert({ data: r as any }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["google-ads", "constitution"] }),
    onError: (e: any) => toast.error("Mentés sikertelen: " + (e?.message ?? e)),
  });

  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["google-ads", "constitution"] }),
    onError: (e: any) => toast.error("Törlés sikertelen: " + (e?.message ?? e)),
  });

  const [newRule, setNewRule] = useState({
    rule_key: "",
    rule_text: "",
    severity: "hard" as "hard" | "soft",
  });

  const rules = q.data ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5" />
          <CardTitle>VIBA Ads Constitution</CardTitle>
        </div>
        <CardDescription>
          Michael minden futás elején beolvassa ezeket a szabályokat. A <strong>hard</strong> szabályokat
          soha nem hághatja át. Ezek elsőbbséget élveznek a Google-ajánlásokkal és a metrikákkal szemben.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">Még nincs alkotmány-szabály. Adj hozzá legalább egyet, mielőtt az M4 sprintben Michael javaslatokat készítene.</p>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-medium">{r.rule_key}</code>
                    <Badge variant={r.severity === "hard" ? "destructive" : "secondary"}>{r.severity}</Badge>
                    {!r.enabled && <Badge variant="outline">inaktív</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Checkbox
                        checked={r.enabled}
                        onCheckedChange={(v) => upsertM.mutate({ ...r, enabled: v === true })}
                      />
                      aktív
                    </label>
                    <Button size="sm" variant="ghost" onClick={() => delM.mutate(r.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm">{r.rule_text}</p>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-md border-2 border-dashed p-3 space-y-2">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Új szabály</div>
          <Input
            placeholder="rule_key (pl. lakossagi_kulon_search)"
            value={newRule.rule_key}
            onChange={(e) => setNewRule({ ...newRule, rule_key: e.target.value })}
          />
          <Textarea
            placeholder="Szabály szövege magyarul (pl. Lakossági szolgáltatás → mindig külön Search kampány, PMAX-be nem kerülhet.)"
            value={newRule.rule_text}
            onChange={(e) => setNewRule({ ...newRule, rule_text: e.target.value })}
            rows={2}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={newRule.severity === "hard"}
                onChange={() => setNewRule({ ...newRule, severity: "hard" })}
              />
              hard (kötelező)
              <input
                type="radio"
                className="ml-3"
                checked={newRule.severity === "soft"}
                onChange={() => setNewRule({ ...newRule, severity: "soft" })}
              />
              soft (irányelv)
            </label>
            <Button
              size="sm"
              disabled={!newRule.rule_key || !newRule.rule_text || upsertM.isPending}
              onClick={() => {
                upsertM.mutate({ ...newRule, enabled: true, sort_order: rules.length });
                setNewRule({ rule_key: "", rule_text: "", severity: "hard" });
              }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Hozzáadás
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}