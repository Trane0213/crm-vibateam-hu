/**
 * AI OS — közös role konstansok.
 *
 * A `userRole` értéke a `roles.name` lowercase-elt változata (lásd
 * `runtime.functions.ts`). A Vibateam CRM-ben a tulajdonos szintű szerep
 * több néven is előfordulhat (hu/en, admin variánsok). A tool
 * jogosultsági listákat innen importáljuk, hogy egyetlen kanonikus
 * forrás legyen.
 */

export const OWNER_ROLES = [
  "owner",
  "tulajdonos",
  "admin",
  "superadmin",
] as const;