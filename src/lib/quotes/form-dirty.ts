/** Van-e eltérés a szerkesztett ajánlat-űrlap és a mentett rekord között (szóközök nélkül). */
export function quoteFormDirty(fields: readonly string[], form: Record<string, string>, saved: Record<string, unknown>): boolean {
  return fields.some((f) => {
    const a = (form[f] ?? "").trim();
    const raw = saved[f];
    const b = raw == null ? "" : String(raw).trim();
    if (a === b) return false;
    // Számmezőknél „10” és „10.00” ugyanaz.
    if (a !== "" && b !== "" && !Number.isNaN(Number(a)) && !Number.isNaN(Number(b))) return Number(a) !== Number(b);
    return true;
  });
}
