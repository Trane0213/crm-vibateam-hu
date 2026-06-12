import { Link } from "@tanstack/react-router";
import { Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVisibleAgents } from "@/hooks/use-visible-agents";
import { AGENT_REGISTRY } from "@/lib/ai/agent-registry";

/**
 * AI agent route guard. Csak akkor rendereli a `children`-t, ha a megadott
 * `agentId`-t az aktuális role láthatja (useVisibleAgents szerint).
 *
 * - agentId = null → mindig enged (általános AI route, pl. landing fallback)
 * - betöltés alatt → spinner
 * - jogosulatlan → Access Denied panel link-kel az AI landing oldalra
 */
export function AgentGate({
  agentId,
  children,
}: {
  agentId: string | null;
  children: React.ReactNode;
}) {
  const { visibleAgentIds, isLoading } = useVisibleAgents();

  if (!agentId) return <>{children}</>;

  if (isLoading) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (visibleAgentIds.has(agentId)) return <>{children}</>;

  const meta = AGENT_REGISTRY.find((a) => a.id === agentId);
  const label = meta ? `${meta.name} – ${meta.short}` : `Agent (${agentId})`;

  return (
    <div className="flex h-full min-h-[400px] items-center justify-center p-6">
      <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">Nincs hozzáférésed</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A(z) <span className="font-medium text-foreground">{label}</span> agentet a
          szerepköröd számára nem engedélyezte a tulajdonos.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ha hozzáférést szeretnél, kérd a tulajdonostól a Beállítások → AI agent
          láthatóság oldalon.
        </p>
        <Button asChild className="mt-5">
          <Link to="/ai-assistants">Vissza az AI Asszisztensekhez</Link>
        </Button>
      </div>
    </div>
  );
}