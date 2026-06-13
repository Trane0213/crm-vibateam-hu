import { Link } from "@tanstack/react-router";
import {
  CheckCircle2, Mail, UserPlus, StickyNote, ArrowRightCircle,
  AlertCircle, Sparkles, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import type { NextStep, StepActionKind } from "@/lib/marketing-workflow";

const TONE: Record<NextStep["tone"], { ring: string; bg: string; text: string; icon: any }> = {
  info:     { ring: "border-[color:var(--status-info)]/30",    bg: "bg-[color:var(--status-info)]/5",    text: "text-[color:var(--status-info)]",    icon: Sparkles },
  action:   { ring: "border-[color:var(--status-warning)]/40", bg: "bg-[color:var(--status-warning)]/5", text: "text-[color:var(--status-warning)]", icon: AlertCircle },
  progress: { ring: "border-primary/30",                       bg: "bg-primary/5",                       text: "text-primary",                       icon: Mail },
  ready:    { ring: "border-[color:var(--status-success)]/40", bg: "bg-[color:var(--status-success)]/5", text: "text-[color:var(--status-success)]", icon: ArrowRightCircle },
  done:     { ring: "border-[color:var(--status-success)]/40", bg: "bg-[color:var(--status-success)]/5", text: "text-[color:var(--status-success)]", icon: CheckCircle2 },
};

const ACTION_ICON: Record<StepActionKind, any> = {
  "add-contact":      UserPlus,
  "edit-contact":     UserPlus,
  "send-email":       Mail,
  "mark-contacted":   CheckCircle2,
  "write-sales-note": StickyNote,
  "open-handoff":     ArrowRightCircle,
  "open-lead":        ExternalLink,
  "none":             CheckCircle2,
};

export function NextBestAction({
  step,
  handoffLeadId,
  onAction,
  pending,
}: {
  step: NextStep;
  handoffLeadId?: string | null;
  onAction: (action: StepActionKind, targetTab?: string) => void;
  pending?: boolean;
}) {
  const tone = TONE[step.tone];
  const Icon = tone.icon;
  const PrimaryIcon = ACTION_ICON[step.primary.action];

  return (
    <div className={`rounded-lg border ${tone.ring} ${tone.bg} p-4 sm:p-5`}>
      <div className="flex items-start gap-3 sm:gap-4">
        <div className={`mt-0.5 rounded-full border ${tone.ring} bg-background p-2 ${tone.text}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Következő lépés
          </div>
          <h2 className={`mt-0.5 text-lg font-semibold ${tone.text}`}>{step.title}</h2>
          <p className="mt-1 text-sm text-foreground/80">{step.description}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {step.primary.action === "open-lead" && handoffLeadId ? (
              <Button asChild size="sm">
                <Link to="/leads/$id" params={{ id: handoffLeadId }}>
                  <PrimaryIcon className="mr-1.5 h-4 w-4" />
                  {step.primary.label}
                </Link>
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={pending || step.primary.action === "none"}
                onClick={() => onAction(step.primary.action, step.primary.targetTab)}
              >
                <PrimaryIcon className="mr-1.5 h-4 w-4" />
                {step.primary.label}
              </Button>
            )}

            {step.secondary && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onAction(step.secondary!.action, step.secondary!.targetTab)}
              >
                {step.secondary.label}
              </Button>
            )}

            {step.why.length > 0 && (
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:underline">
                      Miért ez a lépés?
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <ul className="space-y-1 text-xs">
                      {step.why.map((w, i) => <li key={i}>• {w}</li>)}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}