import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { UserPlus, Building2, Mail, Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/contacts/$id")({
  component: ContactDetail,
});

function ContactDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["contacts", "detail", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("");

  useEffect(() => {
    if (!q.data) return;
    setName(q.data.name ?? "");
    setEmail(q.data.email ?? "");
    setPhone(q.data.phone ?? "");
    setPosition(q.data.position ?? "");
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contacts").update({
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        position: position.trim() || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Kapcsolattartó mentve");
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["contacts", "detail", id] });
    },
    onError: (e: any) => toast.error("Mentés sikertelen", { description: humanizeSupabaseError(e) }),
  });

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Kapcsolattartó betöltése…</div>;
  if (q.error || !q.data) {
    return <div className="p-6"><EmptyState icon={UserPlus} title="Kapcsolattartó nem található" description={(q.error as any)?.message} /></div>;
  }

  const dirty =
    name !== (q.data.name ?? "") ||
    email !== (q.data.email ?? "") ||
    phone !== (q.data.phone ?? "") ||
    position !== (q.data.position ?? "");

  return (
    <div className="flex flex-col">
      <div className="border-b bg-background px-6 py-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Kapcsolattartó</div>
        <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold">
          <UserPlus className="h-5 w-5 text-muted-foreground" />
          {q.data.name ?? "Névtelen kapcsolattartó"}
        </h1>
        <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted-foreground">
          {q.data.company_id && (
            <Link to="/customers/$id" params={{ id: q.data.company_id }} className="inline-flex items-center gap-1 text-primary hover:underline">
              <Building2 className="h-3.5 w-3.5" />Cég megnyitása
            </Link>
          )}
          {q.data.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{q.data.email}</span>}
          {q.data.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{q.data.phone}</span>}
        </div>
      </div>

      <div className="p-6">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="text-sm">Adatok szerkesztése</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="contact-name">Név *</Label>
              <Input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="contact-email">E-mail</Label>
                <Input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="contact-phone">Telefon</Label>
                <Input id="contact-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact-position">Beosztás</Label>
              <Input id="contact-position" value={position} onChange={(e) => setPosition(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" asChild>
                <Link to="/contacts">Vissza</Link>
              </Button>
              <Button disabled={!dirty || !name.trim() || save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? "Mentés…" : "Mentés"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}