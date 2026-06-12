import { useState } from "react";
import { Plus, Trash2, Pencil, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/page-header";
import { useListWhere, useUpsert, useDelete } from "@/lib/db-hooks";
import { formatHuf } from "@/lib/format";

type QuoteItem = {
  id: string;
  quote_id: string;
  name: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
};

/**
 * Ajánlat tételek panel (`quote_items` tábla).
 * Tényleges DB-séma: id, quote_id, name, quantity, unit, unit_price, created_at.
 * Sor-összeg = quantity * unit_price (számolt, nem tárolt).
 */
export function QuoteItemsPanel({ quoteId }: { quoteId: string }) {
  const items = useListWhere<QuoteItem>("quote_items", "quote_id", quoteId, {
    order: "created_at",
    ascending: true,
  });
  const upsert = useUpsert("quote_items");
  const del = useDelete("quote_items");

  const [editing, setEditing] = useState<Partial<QuoteItem> | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const rows = items.data ?? [];
  const sum = rows.reduce(
    (acc, r) => acc + (Number(r.quantity) || 0) * (Number(r.unit_price) || 0),
    0,
  );

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {rows.length} tétel · összeg: <span className="font-medium tabular-nums text-foreground">{formatHuf(sum)}</span>
        </div>
        <Button size="sm" onClick={() => setEditing({ quote_id: quoteId, quantity: 1 })}>
          <Plus className="mr-1 h-4 w-4" /> Új tétel
        </Button>
      </div>

      {items.isLoading ? (
        <div className="mt-3 text-sm text-muted-foreground">Betöltés…</div>
      ) : rows.length === 0 ? (
        <div className="mt-3">
          <EmptyState icon={Package} title="Még nincs tétel" description="Add hozzá az első ajánlati tételt." />
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Megnevezés</TableHead>
                <TableHead className="text-right">Menny.</TableHead>
                <TableHead>Egység</TableHead>
                <TableHead className="text-right">Egységár</TableHead>
                <TableHead className="text-right">Összeg</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const total = (Number(r.quantity) || 0) * (Number(r.unit_price) || 0);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.quantity ?? "—"}</TableCell>
                    <TableCell>{r.unit ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatHuf(r.unit_price)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatHuf(total)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setEditing(r)} aria-label="Szerkesztés">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteId(r.id)} aria-label="Törlés">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow>
                <TableCell colSpan={4} className="text-right text-sm text-muted-foreground">Összesen</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{formatHuf(sum)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Tétel szerkesztése" : "Új tétel"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="qi-name">Megnevezés</Label>
                <Input
                  id="qi-name"
                  value={editing.name ?? ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="pl. Klíma szerelés"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="qi-qty">Mennyiség</Label>
                  <Input
                    id="qi-qty"
                    type="number"
                    step="0.01"
                    value={editing.quantity ?? ""}
                    onChange={(e) => setEditing({ ...editing, quantity: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="qi-unit">Egység</Label>
                  <Input
                    id="qi-unit"
                    value={editing.unit ?? ""}
                    onChange={(e) => setEditing({ ...editing, unit: e.target.value })}
                    placeholder="db / óra / m²"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="qi-price">Egységár (HUF)</Label>
                  <Input
                    id="qi-price"
                    type="number"
                    step="1"
                    value={editing.unit_price ?? ""}
                    onChange={(e) => setEditing({ ...editing, unit_price: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                Sor összeg:{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {formatHuf((Number(editing.quantity) || 0) * (Number(editing.unit_price) || 0))}
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Mégse</Button>
            <Button
              disabled={upsert.isPending || !editing?.name}
              onClick={() => {
                if (!editing) return;
                upsert.mutate(
                  {
                    id: editing.id,
                    quote_id: quoteId,
                    name: editing.name,
                    quantity: editing.quantity,
                    unit: editing.unit,
                    unit_price: editing.unit_price,
                  },
                  { onSuccess: () => setEditing(null) },
                );
              }}
            >
              Mentés
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tétel törlése?</AlertDialogTitle>
            <AlertDialogDescription>Ez a művelet nem vonható vissza.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mégse</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) del.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
              }}
            >
              Törlés
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}