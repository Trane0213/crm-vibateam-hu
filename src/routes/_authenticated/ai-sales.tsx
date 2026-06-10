import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bot, Send, Sparkles, Search, Building2, UserPlus, BellRing, FileText, Mail } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Route = createFileRoute("/_authenticated/ai-sales")({
  component: AiSales,
});

type Msg = { role: "user" | "assistant"; content: string };

const tools = [
  { icon: Search, name: "search_crm", desc: "Keresés a teljes CRM-ben" },
  { icon: Building2, name: "find_company_by_domain", desc: "Cég azonosítása email cím alapján" },
  { icon: UserPlus, name: "find_contact_by_email", desc: "Kapcsolattartó keresése" },
  { icon: Mail, name: "create_lead_from_email", desc: "Lead generálás emailből" },
  { icon: BellRing, name: "suggest_followup", desc: "Follow-up javaslat ajánlathoz" },
  { icon: FileText, name: "summarize_lead", desc: "Lead összefoglalója" },
];

function AiSales() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Szia! Én vagyok a VIBA AI Értékesítő. Hamarosan elérhető leszek — segítek leadek minősítésében, ajánlatok követésében és follow-up javaslatokban." },
  ]);
  const [input, setInput] = useState("");

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setMessages((m) => [...m, { role: "user", content: input }]);
    setInput("");
    toast.info("AI Értékesítő hamarosan aktív", { description: "OPENAI_API_KEY konfiguráció szükséges." });
  };

  return (
    <div className="grid h-[calc(100vh-5.5rem)] grid-cols-1 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col border-r min-w-0">
        <div className="flex items-center justify-between border-b px-6 py-3">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <h1 className="text-base font-semibold">AI Értékesítő</h1>
            <Badge variant="secondary">hamarosan</Badge>
          </div>
        </div>
        <ScrollArea className="flex-1 px-6 py-4">
          <div className="mx-auto max-w-2xl space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`rounded-lg px-3 py-2 text-sm max-w-[80%] ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {m.content}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <form onSubmit={send} className="border-t p-4">
          <div className="mx-auto flex max-w-2xl gap-2">
            <Input placeholder="Pl. Milyen ajánlatok lejártak a héten?" value={input} onChange={(e) => setInput(e.target.value)} />
            <Button type="submit" size="icon"><Send className="h-4 w-4" /></Button>
          </div>
        </form>
      </div>
      <div className="hidden lg:flex flex-col bg-muted/20 overflow-auto">
        <div className="border-b px-4 py-3">
          <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent-foreground" /><h2 className="text-sm font-medium">Képességek</h2></div>
          <p className="mt-1 text-xs text-muted-foreground">Az ágens nem csak chat — eseményekre is reagál (új email → lead).</p>
        </div>
        <div className="space-y-2 p-4">
          {tools.map((t) => (
            <Card key={t.name}>
              <CardHeader className="p-3"><CardTitle className="flex items-center gap-2 text-xs font-mono"><t.icon className="h-3.5 w-3.5" />{t.name}</CardTitle></CardHeader>
              <CardContent className="px-3 pb-3 pt-0 text-[11px] text-muted-foreground">{t.desc}</CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}