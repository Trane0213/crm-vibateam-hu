/**
 * Jelenléti napló alapértelmezett dátumai Europe/Budapest naptári nap szerint.
 * Korábban a böngésző UTC-napját használtuk, ami éjfél körül (és hónap elején)
 * az előző napot/hónapot ajánlotta fel. Csak az űrlap kezdőértéke; a mentett
 * adat és a szerver ellenőrzése változatlan.
 */
export function attendanceToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function attendanceMonthStart(now: Date = new Date()): string {
  return `${attendanceToday(now).slice(0, 8)}01`;
}
