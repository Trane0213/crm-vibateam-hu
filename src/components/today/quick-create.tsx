import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { RecordDialog, type Field } from "@/components/resource/resource-page";
import { useUpsert } from "@/lib/db-hooks";
import { toast } from "sonner";
import { findOpenLeadDuplicate } from "@/lib/dedupe/detect";

const LEAD_FIELDS: Field[] = [
  { name: "company_id", label: "Ügyfél", type: "ref", ref: { table: "companies", labelColumn: "name" } },
  { name: "contact_id", label: "Kapcsolattartó", type: "ref", ref: { table: "contacts", labelColumn: "name" } },
  { name: "source", label: "Forrás", type: "text", placeholder: "pl. Weboldal, Ajánlás" },
  { name: "project_type", label: "Projekt típus", type: "text" },
  { name: "status", label: "Státusz", type: "select", required: true, options: [
    { value: "new", label: "Új" }, { value: "contacted", label: "Felvettük" },
    { value: "lost", label: "Elveszett" },
  ]},
  { name: "summary", label: "Összefoglaló", type: "textarea" },
];

const FOLLOWUP_FIELDS: Field[] = [
  { name: "project_id", label: "Projekt", type: "ref", ref: { table: "projects", labelColumn: "title" } },
  { name: "company_id", label: "Ügyfél", type: "ref", ref: { table: "companies", labelColumn: "name" } },
  { name: "followup_type", label: "Típus", type: "select", options: [
    { value: "call", label: "Telefon" }, { value: "email", label: "E-mail" },
    { value: "meeting", label: "Találkozó" }, { value: "other", label: "Egyéb" },
  ]},
  { name: "due_date", label: "Esedékesség", type: "datetime", required: true },
  { name: "result", label: "Jegyzet", type: "textarea" },
];

const QUOTE_FIELDS: Field[] = [
  { name: "project_id", label: "Projekt", type: "ref", ref: { table: "projects", labelColumn: "title" }, required: true },
  { name: "version", label: "Verzió", type: "number" },
  { name: "status", label: "Státusz", type: "select", required: true, options: [
    { value: "draft", label: "Készül" }, { value: "sent", label: "Kiküldve" },
    { value: "negotiation", label: "Tárgyalás" }, { value: "won", label: "Megnyert" },
    { value: "lost", label: "Elveszett" },
  ]},
  { name: "total_amount", label: "Összérték (HUF)", type: "number" },
];

function QuickButton({
  table, label, title, fields, defaults, icon, variant = "default", onCreated,
}: {
  table: string;
  label: string;
  title: string;
  fields: Field[];
  defaults?: Record<string, any>;
  icon?: ReactNode;
  variant?: "default" | "secondary" | "outline";
  onCreated?: (row: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const upsert = useUpsert(table);
  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}>
        {icon ?? <Plus className="mr-1 h-3.5 w-3.5" />}
        {label}
      </Button>
      <RecordDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        fields={fields}
        defaults={defaults ?? null}
        submitting={upsert.isPending}
        onSubmit={async (values) => {
          const merged = { ...(defaults ?? {}), ...values };
          const row = await upsert.mutateAsync(merged);
          toast.success(`${title} mentve`);
          setOpen(false);
          onCreated?.(row);
        }}
      />
    </>
  );
}

export function QuickCreateLeadButton({ onCreated }: { onCreated?: (row: any) => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const upsert = useUpsert("leads");
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        Új érdeklődő
      </Button>
      <RecordDialog
        open={open}
        onOpenChange={setOpen}
        title="Új érdeklődő"
        fields={LEAD_FIELDS}
        defaults={{ status: "new" }}
        submitting={upsert.isPending}
        onSubmit={async (values) => {
          const merged: Record<string, any> = { status: "new", ...(values as Record<string, any>) };
          // Duplikáció ellenőrzés — nyitott lead ugyanahhoz a céghez (a leads tábla
          // nem tárol külön email mezőt, ezért company-alapon szűrünk).
          const dup = await findOpenLeadDuplicate({
            companyId: merged.company_id ?? null,
            email: null,
          });
          if (dup) {
            toast.info("Már létezik nyitott érdeklődő", {
              description: dup.reason === "company"
                ? "Ennek az ügyfélnek már van aktív érdeklődője."
                : "Erre az email címre már van aktív érdeklődő.",
              action: { label: "Megnyitás", onClick: () => navigate({ to: "/leads/$id", params: { id: dup.id } }) },
            });
            setOpen(false);
            navigate({ to: "/leads/$id", params: { id: dup.id } });
            return;
          }
          const row = await upsert.mutateAsync(merged);
          toast.success("Új érdeklődő mentve");
          setOpen(false);
          onCreated?.(row);
        }}
      />
    </>
  );
}

export function QuickCreateFollowupButton({
  defaults, label = "Új utókövetés", variant = "secondary",
}: {
  defaults?: Record<string, any>;
  label?: string;
  variant?: "default" | "secondary" | "outline";
}) {
  // datetime-local default: holnap 9:00
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
  const seed = { followup_type: "call", due_date: d.toISOString(), ...(defaults ?? {}) };
  return (
    <QuickButton
      table="followups" label={label} title="Új utókövetés"
      fields={FOLLOWUP_FIELDS} defaults={seed} variant={variant}
    />
  );
}

export function QuickCreateQuoteButton({
  defaults, label = "Új ajánlat", variant = "secondary",
}: {
  defaults?: Record<string, any>;
  label?: string;
  variant?: "default" | "secondary" | "outline";
}) {
  const seed = { status: "draft", version: 1, ...(defaults ?? {}) };
  return (
    <QuickButton
      table="quotes" label={label} title="Új ajánlat"
      fields={QUOTE_FIELDS} defaults={seed} variant={variant}
    />
  );
}