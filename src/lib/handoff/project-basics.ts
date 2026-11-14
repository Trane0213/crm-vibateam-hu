/**
 * Átadás fül alapadat-pótlás: csak a ténylegesen megváltozott, engedélyezett
 * mezők kerülnek a mentésbe (address, deadline, és Tulajdonosnál
 * project_manager_user_id). Más projektmező — különösen a lead_id és a
 * státusz — sosem kerül bele, így a megnyerési triggerek érintetlenek.
 */
const YMD = /^\d{4}-\d{2}-\d{2}$/;
export type BasicsDraft = { address: string; deadline: string; pm?: string };
export function projectBasicsPatch(
  saved: { address?: string | null; deadline?: string | null; project_manager_user_id?: string | null },
  draft: BasicsDraft,
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  const addr = draft.address.replace(/\s+/g, " ").trim();
  if (addr !== (saved.address ?? "").trim()) out.address = addr || null;
  const dl = draft.deadline.trim();
  if ((dl === "" || YMD.test(dl)) && dl !== (saved.deadline ?? "").slice(0, 10)) out.deadline = dl || null;
  // Projektvezetőt törölni nem lehet innen (üres = nincs változás).
  if (draft.pm !== undefined && draft.pm && draft.pm !== (saved.project_manager_user_id ?? "")) out.project_manager_user_id = draft.pm;
  return out;
}

/**
 * Ki pótolhat az Átadás fülön (csak a felület szűkebb a `projects_write` RLS-nél,
 * sosem tágabb): alapadat = Tulajdonos vagy projektvezető; projektvezető
 * kijelölése/cseréje = csak Tulajdonos (Sales nem adhat át felelőst).
 */
export function handoffEditRights(role: string | null | undefined): { basics: boolean; assignPm: boolean } {
  return { basics: role === "owner" || role === "project_manager", assignPm: role === "owner" };
}
