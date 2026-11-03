export type QuoteWorkflow = "received_budget" | "viba_offer";
export function quoteWorkflow(value: unknown): QuoteWorkflow | null {
  return value === "received_budget" || value === "viba_offer" ? value : null;
}
export function quoteWorkflowFeatures(value: unknown) {
  const kind = quoteWorkflow(value);
  return { kind, ownEditor: kind === "viba_offer", documents: kind !== null, stepCount: kind ? 4 : 0 };
}