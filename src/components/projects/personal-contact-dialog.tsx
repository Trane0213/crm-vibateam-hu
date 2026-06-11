import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { toast } from "sonner";

/**
 * Egyszerűsített magánszemély kapcsolattartó űrlap:
 * Név (kötelező), Telefon, Email, Cím.
 * A „Cím” a contacts.notes mezőbe kerül (külön address oszlop nincs az
 * adatbázisban — adatbázis módosítás nem történt). Cég nem kötelező.
 */
export function PersonalContactDialog({ triggerLabel = "Új magánszemély" }: { triggerLabel?: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  function reset() {
    setName(""); setPhone(""); setEmail(""); setAddress("");
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("A név kötelező.");
      const payload: any = { name: name.trim() };
      if (phone.trim()) payload.phone = phone.trim();
      if (email.trim()) payload.email = email.trim();
      if (address.trim()) payload.notes = `Cím: ${address.trim()}`;
      const { error } = await supabase.from("contacts").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["table", "contacts"] });
      toast.success("Magánszemély létrehozva");
      setOpen(false); reset();
    },
    onError: (e: any) => toast.error("Sikertelen", { description: humanizeSupabaseError(e) }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><User className="mr-1.5 h-4 w-4" />{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Új magánszemély</DialogTitle>
          <DialogDescription>Lakossági ügyfél gyors rögzítése. Cég nem kötelező.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Név *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Telefon</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Cím</Label>
            <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Pl. 1051 Budapest, Példa utca 12." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Mégse</Button>
          <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Mentés…" : "Létrehozás"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}