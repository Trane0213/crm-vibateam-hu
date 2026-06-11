import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/page-header";
import { UserPlus, Trash2, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { PROJECT_CONTACT_ROLE, PROJECT_CONTACT_ROLE_LABEL } from "@/lib/viba-constants";

type Row = {
  id: string;
  contact_id: string;
  role: string | null;
  is_primary: boolean;
  notes: string | null;
  contact: { id: string; name: string | null; email: string | null; phone: string | null; position: string | null } | null;
};

function useProjectContacts(projectId: string) {
  return useQuery({
    queryKey: ["project_contacts", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_contacts")
        .select("id, contact_id, role, is_primary, notes, contact:contacts(id,name,email,phone,position)")
        .eq("project_id", projectId);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });
}

function useContactsList() {
  return useQuery({
    queryKey: ["contacts", "all-for-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts").select("id,name,email,company_id").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function ProjectContactsPanel({ projectId, companyId }: { projectId: string; companyId: string | null | undefined }) {
  const qc = useQueryClient();
  const list = useProjectContacts(projectId);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("project_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_contacts", projectId] });
      toast.success("Eltávolítva");
    },
    onError: (e: any) => toast.error("Sikertelen", { description: humanizeSupabaseError(e) }),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <AddContactDialog projectId={projectId} companyId={companyId} />
      </div>

      {list.isLoading ? (
        <div className="text-sm text-muted-foreground">Betöltés…</div>
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState icon={UserPlus} title="Még nincs kapcsolattartó" description="A „Kapcsolattartó hozzáadása” gombbal vegyél fel egyet." />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {(list.data ?? []).map((r) => (
            <li key={r.id} className="rounded-md border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {r.contact ? (
                      <Link to="/contacts/$id" params={{ id: r.contact.id }} className="font-medium text-primary hover:underline truncate">
                        {r.contact.name ?? "—"}
                      </Link>
                    ) : (
                      <span className="font-medium">—</span>
                    )}
                    {r.role && <Badge variant="outline" className="font-normal">{PROJECT_CONTACT_ROLE_LABEL[r.role] ?? r.role}</Badge>}
                  </div>
                  {r.contact?.position && <div className="text-xs text-muted-foreground">{r.contact.position}</div>}
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {r.contact?.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{r.contact.email}</span>}
                    {r.contact?.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{r.contact.phone}</span>}
                  </div>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" className="text-destructive" title="Eltávolítás">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Eltávolítás a projektről</AlertDialogTitle>
                      <AlertDialogDescription>A kapcsolattartó nem törlődik, csak a projektről kerül le.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Mégse</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove.mutate(r.id)}>Eltávolítás</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddContactDialog({ projectId, companyId }: { projectId: string; companyId: string | null | undefined }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"existing" | "new">("existing");

  // Existing picker
  const contacts = useContactsList();
  const [contactId, setContactId] = useState<string>("");
  const [role, setRole] = useState<string>("");

  // New contact form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("");
  const [newRole, setNewRole] = useState<string>("");

  function reset() {
    setContactId(""); setRole("");
    setName(""); setEmail(""); setPhone(""); setPosition(""); setNewRole("");
    setTab("existing");
  }

  const linkExisting = useMutation({
    mutationFn: async () => {
      if (!contactId) throw new Error("Válassz kapcsolattartót.");
      const { error } = await supabase.from("project_contacts").insert({
        project_id: projectId,
        contact_id: contactId,
        role: role || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_contacts", projectId] });
      toast.success("Hozzárendelve");
      setOpen(false); reset();
    },
    onError: (e: any) => toast.error("Sikertelen", { description: humanizeSupabaseError(e) }),
  });

  const createAndLink = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("A név kötelező.");
      const payload: any = { name: name.trim() };
      if (email.trim()) payload.email = email.trim();
      if (phone.trim()) payload.phone = phone.trim();
      if (position.trim()) payload.position = position.trim();
      if (companyId) payload.company_id = companyId;
      const { data: created, error } = await supabase.from("contacts").insert(payload).select("id").single();
      if (error) throw error;
      const { error: e2 } = await supabase.from("project_contacts").insert({
        project_id: projectId,
        contact_id: created.id,
        role: newRole || null,
      });
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_contacts", projectId] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Létrehozva és hozzárendelve");
      setOpen(false); reset();
    },
    onError: (e: any) => toast.error("Sikertelen", { description: humanizeSupabaseError(e) }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><UserPlus className="mr-1.5 h-4 w-4" />Kapcsolattartó hozzáadása</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Kapcsolattartó a projekthez</DialogTitle>
          <DialogDescription>Válassz meglévőt vagy hozz létre újat.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="existing">Meglévő</TabsTrigger>
            <TabsTrigger value="new">Új kapcsolattartó</TabsTrigger>
          </TabsList>

          <TabsContent value="existing" className="space-y-3 pt-3">
            <div>
              <Label>Kapcsolattartó</Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger><SelectValue placeholder="Válassz…" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {(contacts.data ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name ?? "—"}{c.email ? ` · ${c.email}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <RoleSelect value={role} onChange={setRole} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Mégse</Button>
              <Button disabled={!contactId || linkExisting.isPending} onClick={() => linkExisting.mutate()}>
                {linkExisting.isPending ? "Mentés…" : "Hozzárendelés"}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="new" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <Label>Név *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <Label>Telefon</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label>Beosztás</Label>
                <Input value={position} onChange={(e) => setPosition(e.target.value)} />
              </div>
            </div>
            <RoleSelect value={newRole} onChange={setNewRole} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Mégse</Button>
              <Button disabled={!name.trim() || createAndLink.isPending} onClick={() => createAndLink.mutate()}>
                {createAndLink.isPending ? "Mentés…" : "Létrehozás + hozzárendelés"}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function RoleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>Szerepkör</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="(opcionális)" /></SelectTrigger>
        <SelectContent>
          {PROJECT_CONTACT_ROLE.map((r) => (
            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}