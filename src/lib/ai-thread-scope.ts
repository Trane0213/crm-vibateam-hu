/**
 * AI-panel beszélgetéseinek rekordhoz kötése. Egy ajánlat / ügy / ügyfél / projekt saját
 * beszélgetést kap; másik rekord beszélgetése soha nem folytatódik és nem kerül a modell
 * előzményei közé. Kontextus nélküli (általános) beszélgetés = scope null; a korábbi,
 * jelölés nélküli beszélgetések általánosnak számítanak.
 */
export type ScopeCtx = { kind: string; id: string } | null | undefined;
export type ScopedThread = { id: string; agent: string; updatedAt: number; scope?: string | null };

export function threadScopeOf(ctx: ScopeCtx): string | null {
  return ctx ? `${ctx.kind}:${ctx.id}` : null;
}

/** Folytatható-e a beszélgetés ezen az oldalon ezzel az asszisztenssel. */
export function canContinueThread(t: ScopedThread | null | undefined, agent: string, scope: string | null): boolean {
  return !!t && t.agent === agent && (t.scope ?? null) === scope;
}

/** Az adott rekord legutóbbi saját beszélgetése (vagy null → új beszélgetés indul). */
export function pickThreadForScope<T extends ScopedThread>(threads: T[], agent: string, scope: string | null): T | null {
  return threads.filter((t) => canContinueThread(t, agent, scope)).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}
