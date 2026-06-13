import { useEffect, useState, type ReactNode } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader, EmptyState } from "@/components/page-header";
import { useList, useUpsert, useDelete, useRefOptions, useRefOptionsRich } from "@/lib/db-hooks";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "datetime"
  | "boolean"
  | "select"
  | "ref";

export type Field = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  ref?: {
    table: string;
    labelColumn: string;
    /** Opcionális: extra oszlopok dúsított címkéhez (useRefOptionsRich). */
    extraColumns?: string[];
    /** Opcionális: ha megadod, a select labelje ezzel formázódik. */
    formatLabel?: (row: any) => string;
    orderColumn?: string;
  };
};

export type Column = {
  key: string;
  label: string;
  render?: (row: any) => ReactNode;
  className?: string;
};

export function ResourcePage({
  title,
  description,
  icon: Icon,
  table,
  fields,
  columns,
  order,
  ascending,
  filter,
  toolbar,
  emptyTitle,
  emptyDescription,
  newButtonLabel = "Új",
  extraActions,
}: {
  title: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  table: string;
  fields: Field[];
  columns: Column[];
  order?: string;
  ascending?: boolean;
  filter?: (rows: any[]) => any[];
  /** Tetszőleges szűrő/kereső sáv a táblázat fölött. */
  toolbar?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  newButtonLabel?: string;
  extraActions?: React.ReactNode;
}) {
  const { data, isLoading, error } = useList<any>(table, { order, ascending });
  const upsert = useUpsert(table);
  const del = useDelete(table);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const rows = filter && data ? filter(data) : (data ?? []);

  // Globális „+ Új" gomb (QuickAddMenu) ?new=1-gyel ide navigálva — azonnal
  // megnyitjuk a létrehozó dialógust, és tisztítjuk az URL-t.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      setEditing(null);
      setOpen(true);
      params.delete("new");
      const q = params.toString();
      const url = window.location.pathname + (q ? `?${q}` : "") + window.location.hash;
      window.history.replaceState({}, "", url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col">
      <PageHeader
        title={title}
        description={description}
        actions={
          <div className="flex items-center gap-2">
            {extraActions}
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              {newButtonLabel}
            </Button>
          </div>
        }
      />
      <div className="p-6">
        {toolbar && <div className="mb-3">{toolbar}</div>}
        {error && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Adatbázis hiba: {(error as any).message}
          </div>
        )}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Icon}
            title={emptyTitle ?? "Itt jelennek meg a rekordok."}
            description={
              emptyDescription ??
              `Kattints a jobb felső sarokban a „${newButtonLabel}" gombra az első hozzáadáshoz.`
            }
          />
        ) : (
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((c) => (
                    <TableHead key={c.key} className={c.className}>
                      {c.label}
                    </TableHead>
                  ))}
                  <TableHead className="w-[110px] text-right">Művelet</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row: any) => (
                  <TableRow key={row.id}>
                    {columns.map((c) => (
                      <TableCell key={c.key} className={c.className}>
                        {c.render ? c.render(row) : (row[c.key] ?? "—")}
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditing(row);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <DeleteButton onConfirm={() => del.mutate(row.id)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      <RecordDialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Szerkesztés" : "Új rekord"}
        fields={fields}
        defaults={editing}
        submitting={upsert.isPending}
        onSubmit={async (v) => {
          await upsert.mutateAsync(editing ? { id: editing.id, ...v } : v);
          setOpen(false);
        }}
      />
    </div>
  );
}

function DeleteButton({ onConfirm }: { onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Biztosan törlöd?</AlertDialogTitle>
          <AlertDialogDescription>
            Ez a művelet nem visszavonható.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Mégse</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Törlés</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function toInput(value: any, type: FieldType): any {
  if (value === null || value === undefined) return "";
  if (type === "datetime") {
    // value is ISO; convert to local "YYYY-MM-DDTHH:mm"
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (type === "date") return String(value).slice(0, 10);
  if (type === "boolean") return Boolean(value);
  return value;
}

function fromInput(value: any, type: FieldType): any {
  if (type === "boolean") return Boolean(value);
  if (value === "" || value === null || value === undefined) return null;
  if (type === "number") return Number(value);
  if (type === "datetime") return new Date(value).toISOString();
  return value;
}

export function RecordDialog({
  open,
  onOpenChange,
  title,
  fields,
  defaults,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  fields: Field[];
  defaults: Record<string, any> | null;
  onSubmit: (values: Record<string, any>) => Promise<void>;
  submitting?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Töltsd ki a kötelező mezőket, majd kattints a Mentés gombra.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <RecordDialogForm
            fields={fields}
            defaults={defaults}
            submitting={submitting}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RecordDialogForm({
  fields,
  defaults,
  submitting,
  onCancel,
  onSubmit,
}: {
  fields: Field[];
  defaults: Record<string, any> | null;
  submitting?: boolean;
  onCancel: () => void;
  onSubmit: (values: Record<string, any>) => Promise<void>;
}) {
  // Synchronous initialization: első rendernél már a végleges értékek vannak,
  // így a Radix Select-ek nem futnak át üres→default tranzíción, ami React 19
  // alatt `removeChild` NotFoundError crash-t okozott.
  const [values, setValues] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    for (const f of fields) init[f.name] = toInput(defaults?.[f.name], f.type);
    return init;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    for (const f of fields) {
      if (f.required) {
        const v = values[f.name];
        if (v === "" || v === null || v === undefined) {
          errs[f.name] = "Kötelező mező.";
        }
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const out: Record<string, any> = {};
    for (const f of fields) out[f.name] = fromInput(values[f.name], f.type);
    await onSubmit(out);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {fields.map((f) => (
        <FieldRow
          key={f.name}
          field={f}
          value={values[f.name]}
          error={errors[f.name]}
          onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))}
        />
      ))}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Mégse
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Mentés…" : "Mentés"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function FieldRow({
  field,
  value,
  onChange,
  error,
}: {
  field: Field;
  value: any;
  onChange: (v: any) => void;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={field.name}>
        {field.label}
        {field.required && <span className="text-destructive"> *</span>}
      </Label>
      <FieldInput field={field} value={value} onChange={onChange} />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: any;
  onChange: (v: any) => void;
}) {
  if (field.type === "textarea") {
    return (
      <Textarea
        id={field.name}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        rows={3}
      />
    );
  }
  if (field.type === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          id={field.name}
          checked={Boolean(value)}
          onCheckedChange={(c) => onChange(Boolean(c))}
        />
        <Label htmlFor={field.name} className="font-normal text-muted-foreground">
          Igen
        </Label>
      </div>
    );
  }
  if (field.type === "select" && field.options) {
    return (
      <Select value={value ?? ""} onValueChange={(v) => onChange(v)}>
        <SelectTrigger id={field.name}>
          <SelectValue placeholder="Válassz…" />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field.type === "ref" && field.ref) {
    return <RefSelect field={field} value={value} onChange={onChange} />;
  }
  const inputType =
    field.type === "number"
      ? "number"
      : field.type === "date"
      ? "date"
      : field.type === "datetime"
      ? "datetime-local"
      : "text";
  return (
    <Input
      id={field.name}
      type={inputType}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      step={field.type === "number" ? "any" : undefined}
    />
  );
}

function RefSelect({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: any;
  onChange: (v: any) => void;
}) {
  const ref = field.ref!;
  const rich = useRefOptionsRich(
    ref.table,
    Array.from(new Set([ref.labelColumn, ...(ref.extraColumns ?? [])])),
    ref.formatLabel ?? ((r: any) => String(r[ref.labelColumn] ?? "—")),
    ref.orderColumn,
  );
  const plain = useRefOptions(ref.table, ref.labelColumn);
  const useRich = !!(ref.formatLabel || (ref.extraColumns && ref.extraColumns.length));
  const data = useRich ? rich.data : plain.data;
  const isLoading = useRich ? rich.isLoading : plain.isLoading;
  return (
    <Select value={value ?? ""} onValueChange={(v) => onChange(v)}>
      <SelectTrigger id={field.name}>
        <SelectValue
          placeholder={isLoading ? "Betöltés…" : "Válassz…"}
        />
      </SelectTrigger>
      <SelectContent>
        {(data ?? []).map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Reusable cell helpers */
export function fmtDate(v: any): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("hu-HU");
}

export function fmtDateTime(v: any): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("hu-HU");
}

/** Generic resolver of foreign-key id → label, used by columns. */
export function useLookup(table: string, labelColumn: string) {
  const { data } = useRefOptions(table, labelColumn);
  const map = new Map((data ?? []).map((o) => [o.value, o.label]));
  return (id: string | null | undefined) => (id ? (map.get(id) ?? "—") : "—");
}