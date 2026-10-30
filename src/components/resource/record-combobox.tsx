import { useRef, useState } from "react";
import { Check, ChevronsUpDown, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useRecordSearch } from "@/lib/use-record-search";
import { cn } from "@/lib/utils";
import type { RecordOption, RecordSearchInput, RecordSource } from "@/lib/record-search-model";

export type RecordComboboxProps = {
  source: RecordSource; value?: string | null; onChange: (id: string) => void;
  label?: string; placeholder?: string; id?: string; disabled?: boolean; className?: string;
  filters?: RecordSearchInput["filters"]; allowClear?: boolean; clearLabel?: string;
  formatLabel?: (row: any) => string;
};
export function RecordCombobox({ source, value, onChange, label = "Rekord", placeholder = "Válassz…", id, disabled, className, filters, allowClear = false, clearLabel = "Nincs kiválasztva", formatLabel }: RecordComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, selected, selectedLoading, rows, searching } = useRecordSearch({ source, filters }, search, open, value || undefined);
  const text = (row: RecordOption) => formatLabel ? formatLabel({ ...row.fields, id: row.value }) : row.label;
  const pick = (id: string) => { onChange(id); setOpen(false); };
  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button type="button" id={id} variant="outline" role="combobox" aria-label={label} aria-expanded={open} disabled={disabled}
          className={cn("h-auto min-h-10 w-full justify-between gap-2 py-2 text-left font-normal", className)}>
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate", !value && "text-muted-foreground")}>{selected ? text(selected) : value ? selectedLoading ? "Betöltés…" : "A kiválasztott rekord nem elérhető" : placeholder}</span>
            {selected?.detail && <span className="block truncate text-xs text-muted-foreground">{selected.detail}</span>}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={12} className="w-[var(--radix-popover-trigger-width)] min-w-64 max-w-[calc(100vw-24px)] p-0 max-sm:fixed max-sm:inset-x-3 max-sm:top-20 max-sm:w-auto"
        onOpenAutoFocus={(event) => { event.preventDefault(); inputRef.current?.focus(); }}>
        <Command shouldFilter={false}>
          <CommandInput ref={inputRef} value={search} onValueChange={setSearch} maxLength={200} placeholder={`${label} keresése…`} aria-label={`${label} keresése`} className="h-12 text-base sm:text-sm" />
          <CommandList className="max-h-[min(55dvh,360px)]" aria-label={`${label} találatok`}>
            {allowClear && <CommandGroup><CommandItem value="__clear" onSelect={() => pick("")} className="min-h-11">{clearLabel}</CommandItem></CommandGroup>}
            {searching ? <div role="status" className="flex items-center justify-center gap-2 p-5 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Keresés…</div> : results.isError ?
              <div role="alert" className="p-4 text-sm text-destructive">Nem sikerült betölteni a találatokat.<Button type="button" variant="ghost" onClick={() => results.refetch()}>Újra</Button></div> : rows.length === 0 ?
              <div role="status" className="p-5 text-center text-sm text-muted-foreground">Nincs találat.</div> :
              <CommandGroup>{rows.map((row) => <CommandItem key={row.value} value={row.value} onSelect={() => pick(row.value)} className="min-h-12 items-start py-2.5">
                <Check className={cn("mt-0.5 size-4 shrink-0", value !== row.value && "invisible")} />
                <span className="min-w-0 flex-1"><span className="block break-words">{text(row)}</span>{row.detail && <span className="block break-words text-xs text-muted-foreground">{row.detail}</span>}<span className="text-[10px] text-muted-foreground">#{row.value.slice(0, 8)}</span></span>
              </CommandItem>)}</CommandGroup>}
          </CommandList>
          {results.hasNextPage && !searching && <div className="border-t p-2"><Button type="button" variant="ghost" className="w-full" disabled={results.isFetchingNextPage} onClick={() => results.fetchNextPage()}>{results.isFetchingNextPage ? "Betöltés…" : "További találatok"}</Button></div>}
        </Command>
      </PopoverContent>
    </Popover>
  );
}