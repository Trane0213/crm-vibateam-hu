import { FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QuoteWorkflow } from "@/lib/quotes/workflow";
export function QuoteWorkflowChoice({ onChoose, disabled = false }: { onChoose: (kind: QuoteWorkflow) => void; disabled?: boolean }) {
  return <div className="space-y-4 py-4">
    <h2 className="text-lg font-semibold">Milyen ajánlatot készítesz?</h2>
    <div className="grid gap-3 sm:grid-cols-2">
      <Button variant="outline" className="h-auto min-h-20 justify-start gap-3 whitespace-normal p-4 text-left" disabled={disabled} onClick={() => onChoose("received_budget")}><FileSpreadsheet className="h-6 w-6 shrink-0" /><span>Kapott költségvetés árazása</span></Button>
      <Button variant="outline" className="h-auto min-h-20 justify-start gap-3 whitespace-normal p-4 text-left" disabled={disabled} onClick={() => onChoose("viba_offer")}><FileText className="h-6 w-6 shrink-0" /><span>Saját VIBA-ajánlat készítése</span></Button>
    </div>
  </div>;
}