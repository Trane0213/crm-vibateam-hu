/**
 * Website → Knowledge Graph publisher — WK-1 STUB.
 *
 * Az egyetlen fájl, ami a `src/lib/knowledge-graph/`-tól függ majd (WK-4-ben).
 * WK-1-ben csak a modul-felület létezik; a `projectFromSource` hívás nem fut,
 * hogy semmilyen KG node vagy edge ne keletkezzen még.
 */

export interface PublishPageChangeInput {
  page_id: string;
  run_id?: string | null;
}

export interface PublishPageChangeResult {
  skipped: true;
  reason: "wk1_stub";
}

/**
 * WK-4-ben ez a függvény a `projectFromSource({ module: 'website', ... })`
 * hívást fogja végezni. Most no-op — csak visszajelez, hogy a hívás alakja él.
 */
export async function publishPageChange(
  _input: PublishPageChangeInput,
): Promise<PublishPageChangeResult> {
  return { skipped: true, reason: "wk1_stub" };
}