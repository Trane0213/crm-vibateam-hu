import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Bot, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";

/**
 * Phase 2 átmeneti megoldás: az AI assistant oldalt egy Sheet-ben iframe-eljük.
 * Ugyanaz az origin → ugyanaz a session, ugyanaz a localStorage → thread history működik.
 * A felhasználó nem hagyja el a Lead Workspace-t.
 * Phase 3 cél: natív embedded chat komponens (useAgentChat hook + AgentChat).
 */
export function AiSheet({
  open, onOpenChange, agent, agentLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agent: "sales" | "crm" | "pm";
  agentLabel: string;
}) {
  const src = `/ai-assistant?agent=${agent}`;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[560px] p-0 flex flex-col">
        <SheetHeader className="border-b px-4 py-3 space-y-1">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <Bot className="h-4 w-4 text-primary" />
            {agentLabel}
          </SheetTitle>
          <SheetDescription className="text-xs flex items-center justify-between">
            <span>AI asszisztens — a Lead Workspace bezárása nélkül</span>
            <Link
              to="/ai-assistant" search={{ agent } as any}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Teljes oldalon <ExternalLink className="h-3 w-3" />
            </Link>
          </SheetDescription>
        </SheetHeader>
        {open && (
          <iframe
            src={src}
            title={agentLabel}
            className="flex-1 w-full border-0"
          />
        )}
      </SheetContent>
    </Sheet>
  );
}