/** Read failures must not discard useful answers; unsafe failures remain blocking. */
export class RuntimeOutcome {
  private readFailures = new Set<string>();
  private blocked = false;

  record(tool: string, failed: boolean, readOnly: boolean) {
    if (!failed) return;
    if (readOnly) this.readFailures.add(tool);
    else this.blocked = true;
  }

  get failed() { return this.blocked || this.readFailures.size > 0; }

  text(answer: string, pending = false) {
    if (this.blocked) return 'A művelet sikertelen; nem igazolt végrehajtás.';
    const text = pending ? 'Jóváhagyást igénylő művelet vár rád.' : answer;
    if (!this.readFailures.size) return text;
    return `Az adatellenőrzés során olvasási hiba történt (${[...this.readFailures].join(', ')}). Az alábbi válasz csak a sikeresen lekért adatokra támaszkodhat; a sikertelen szűrés teljes körű helyreállítása nem igazolt.\n\n${text}`;
  }
}