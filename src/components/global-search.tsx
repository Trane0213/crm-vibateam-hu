import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";

type Hit = {
  id: string;
  label: string;
  sub?: string;
  type: "companies" | "contacts" | "projects" | "leads" | "quotes" | "emails";
};

const TYPE_LABEL: Record<Hit["type"], string> = {
  companies: "Cég", contacts: "Kapcsolattartó", projects: "Projekt",
  leads: "Lead", quotes: "Ajánlat", emails: "Email",
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  // Cmd/Ctrl+K nyitja
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const term = q.trim();
  const enabled = term.length >= 2;

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", term],
    enabled,
    queryFn: async (): Promise<Hit[]> => {
      const like = `%${term}%`;
      const [co, ct, pr, ld, qu, em] = await Promise.all([
        supabase.from("companies").select("id,name,city").ilike("name", like).limit(5),
        supabase.from("contacts").select("id,name,email,company_id").ilike("name", like).limit(5),
        supabase.from("projects").select("id,title,status").ilike("title", like).limit(5),
        supabase.from("leads").select("id,source,status,description").or(`source.ilike.${like},description.ilike.${like}`).limit(5),
        supabase.from("quotes").select("id,title,version,status").or(`title.ilike.${like}`).limit(5),
        supabase.from("emails").select("id,subject,summary,from_email,thread_id").or(`subject.ilike.${like},summary.ilike.${like},from_email.ilike.${like}`).limit(5),
      ]);
      const out: Hit[] = [];
      (co.data ?? []).forEach((r: any) => out.push({ id: r.id, type: "companies", label: r.name ?? "—", sub: r.city ?? undefined }));
      (ct.data ?? []).forEach((r: any) => out.push({ id: r.id, type: "contacts", label: r.name ?? "—", sub: r.email ?? undefined }));
      (pr.data ?? []).forEach((r: any) => out.push({ id: r.id, type: "projects", label: r.title ?? "—", sub: r.status ?? undefined }));
      (ld.data ?? []).forEach((r: any) => out.push({ id: r.id, type: "leads", label: r.description?.slice(0, 60) ?? r.source ?? "Lead", sub: r.status ?? undefined }));
      (qu.data ?? []).forEach((r: any) => out.push({ id: r.id, type: "quotes", label: r.title ?? (r.version != null ? `v${r.version}` : "Ajánlat"), sub: r.status ?? undefined }));
      (em.data ?? []).forEach((r: any) => out.push({ id: r.id, type: "emails", label: r.subject ?? r.summary ?? "(nincs tárgy)", sub: r.from_email ?? undefined }));
      return out;
    },
  });

  const grouped = useMemo(() => {
    const g: Record<Hit["type"], Hit[]> = {
      companies: [], contacts: [], projects: [], leads: [], quotes: [], emails: [],
    };
    (data ?? []).forEach((h) => g[h.type].push(h));
    return g;
  }, [data]);

  const go = (h: Hit) => {
    setOpen(false);
    setQ("");
    if (h.type === "emails") {
      const thread = (data ?? []).find((d) => d.id === h.id) as any;
      const threadId = thread?.thread_id;
      if (threadId) {
        navigate({ to: "/emails/$threadId", params: { threadId } });
        return;
      }
      navigate({ to: "/emails" });
      return;
    }
    if (h.type === "companies")  navigate({ to: "/companies/$id", params: { id: h.id } });
    if (h.type === "contacts")   navigate({ to: "/contacts/$id",  params: { id: h.id } });
    if (h.type === "projects")   navigate({ to: "/projects/$id",  params: { id: h.id } });
    if (h.type === "leads")      navigate({ to: "/leads/$id",     params: { id: h.id } });
    if (h.type === "quotes")     navigate({ to: "/quotes/$id",    params: { id: h.id } });
  };

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2 text-muted-foreground" onClick={() => setOpen(true)}>
        <Search className="h-3.5 w-3.5" />
        <span className="hidden md:inline">Keresés…</span>
        <kbd className="hidden md:inline-flex h-5 items-center rounded border bg-muted px-1.5 text-[10px] font-mono text-muted-foreground">⌘K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Cégek, projektek, kapcsolatok, ajánlatok, emailek…" value={q} onValueChange={setQ} />
        <CommandList>
          {!enabled && <CommandEmpty>Írj legalább 2 karaktert.</CommandEmpty>}
          {enabled && !isFetching && (data ?? []).length === 0 && <CommandEmpty>Nincs találat.</CommandEmpty>}
          {enabled && isFetching && <CommandEmpty>Keresés…</CommandEmpty>}
          {(Object.keys(grouped) as Hit["type"][]).map((type, idx) => {
            const rows = grouped[type];
            if (!rows.length) return null;
            return (
              <div key={type}>
                {idx > 0 && <CommandSeparator />}
                <CommandGroup heading={TYPE_LABEL[type]}>
                  {rows.map((h) => (
                    <CommandItem key={`${type}-${h.id}`} value={`${type}-${h.id}-${h.label}`} onSelect={() => go(h)}>
                      <div className="flex flex-col">
                        <span className="text-sm">{h.label}</span>
                        {h.sub && <span className="text-xs text-muted-foreground">{h.sub}</span>}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </div>
            );
          })}
        </CommandList>
      </CommandDialog>
    </>
  );
}