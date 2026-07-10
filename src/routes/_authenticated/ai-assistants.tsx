import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, Lock } from "lucide-react";
import georgePortrait from "@/assets/agent-george.jpg";
import timothyPortrait from "@/assets/agent-timothy.jpg";
import bossPortrait from "@/assets/agent-boss.jpg";
import scarletPortrait from "@/assets/agent-scarlet.jpg";
import michaelPortrait from "@/assets/agent-michael.jpg";
import { useVisibleAgents } from "@/hooks/use-visible-agents";

export const Route = createFileRoute("/_authenticated/ai-assistants")({
  component: AiAssistantsGallery,
});

type AssistantCard = {
  id: string;
  /** agent_id az agent_role_access-ben */
  agentId: string;
  name: string;
  role: string;
  description: string;
  portrait: string;
  to: string;
  search?: Record<string, string>;
};

const ASSISTANTS: AssistantCard[] = [
  {
    id: "george",
    agentId: "crm",
    name: "George",
    role: "CRM Navigátor",
    description:
      "Segítek ügyfelek, cégek, kapcsolattartók és CRM adatok gyors megtalálásában.",
    portrait: georgePortrait,
    to: "/ai-assistant",
    search: { agent: "crm" },
  },
  {
    id: "timothy",
    agentId: "sales",
    name: "Timothy",
    role: "Értékesítési Segítő",
    description:
      "Segítek az értékesítési lehetőségek kezelésében, ajánlatok követésében és utókövetések szervezésében.",
    portrait: timothyPortrait,
    to: "/ai-assistant",
    search: { agent: "sales" },
  },
  {
    id: "boss",
    agentId: "pm",
    name: "Boss",
    role: "Projektfelügyelő",
    description:
      "Segítek a projektek, határidők és feladatok áttekintésében.",
    portrait: bossPortrait,
    to: "/ai-assistant",
    search: { agent: "pm" },
  },
  {
    id: "scarlet",
    agentId: "marketing",
    name: "Scarlet",
    role: "Marketing Stratéga",
    description:
      "Segítek új ügyfelek és üzleti lehetőségek felkutatásában.",
    portrait: scarletPortrait,
    to: "/sales/research",
  },
  {
    id: "michael",
    agentId: "ads",
    name: "Michael",
    role: "Google Ads Specialista",
    description:
      "Google Ads elemző. Csak Tulajdonos érheti el. Elsődleges célja a VIBA-TEAM üzleti céljainak támogatása, nem a metrikák javítása.",
    portrait: michaelPortrait,
    to: "/ai-assistant",
    search: { agent: "ads" },
  },
];

function AiAssistantsGallery() {
  const { visibleAgentIds, isLoading } = useVisibleAgents();
  const visible = ASSISTANTS.filter((a) => visibleAgentIds.has(a.agentId));
  return (
    <div className="flex flex-col">
      <PageHeader
        title="AI Asszisztensek"
        description="Válaszd ki melyik munkatárssal szeretnél beszélgetni. Mindegyik más területen segít."
      />
      {visible.length === 0 && !isLoading && (
        <div className="mx-6 mt-6 flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
          <Lock className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div className="text-sm">
            <div className="font-medium">Nincs elérhető AI asszisztens</div>
            <p className="mt-1 text-muted-foreground">
              A szerepköröd számára jelenleg nincs engedélyezett agent. Kérd a
              tulajdonostól a Beállítások → AI agent láthatóság oldalon.
            </p>
          </div>
        </div>
      )}
      <div className="grid gap-6 p-6 sm:grid-cols-2 xl:grid-cols-4">
        {visible.map((a) => (
          <Card key={a.id} className="flex flex-col overflow-hidden">
            <div className="aspect-square w-full overflow-hidden bg-muted">
              <img
                src={a.portrait}
                alt={`${a.name} – ${a.role}`}
                width={1024}
                height={1024}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
            <CardContent className="flex flex-1 flex-col gap-3 p-4">
              <div>
                <div className="text-lg font-semibold leading-tight">{a.name}</div>
                <div className="text-sm text-muted-foreground">{a.role}</div>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">{a.description}</p>
              <div className="mt-auto pt-2">
                <Button asChild className="w-full">
                  <Link
                    to={a.to as any}
                    {...(a.search ? { search: a.search as any } : {})}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Beszélgetés indítása
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}