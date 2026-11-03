export function progressLabel(tool: string | null, status: string, failed=false) {
  if(failed)return 'Egy adatellenőrzés nem sikerült; a hiányt külön jelzem.';
  if (status !== 'running') return status === 'ok' ? 'Az ellenőrzés befejeződött.' : 'Az ellenőrzés elakadt; a válaszban jelzem a hiányt.';
  if (!tool) return 'Értelmezem a kérdésedet.';
  if (tool.includes('email') || tool.includes('mailbox')) return 'Ellenőriztem a kapcsolódó levelezés elérhetőségét.';
  if (tool.includes('quote')) return 'Ellenőriztem az ajánlat adatait.';
  if (tool.includes('document')) return 'Ellenőriztem a dokumentum elérhetőségét.';
  if (tool.includes('history') || tool.includes('followup')) return 'Ellenőriztem a rögzített előzményeket és teendőket.';
  return 'Ellenőriztem a kapcsolódó ügy adatait.';
}