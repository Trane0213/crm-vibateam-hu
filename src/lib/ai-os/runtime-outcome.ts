/** Read failures must not discard useful answers; unsafe failures remain blocking. */
export class RuntimeOutcome {
  private readFailures = new Set<string>();
  private blocked = false;
  private sourceLinks = new Set<string>();

  observe(output: unknown) {
    if (Array.isArray(output)) { for (const item of output) this.observe(item); return; }
    if (!output || typeof output !== 'object') return;
    for (const [key, value] of Object.entries(output)) {
      if ((key === 'source_link' || key === 'link') && typeof value === 'string' && /^\/quotes\/[a-zA-Z0-9-]+$/.test(value)) this.sourceLinks.add(value);
      else if (typeof value === 'object') this.observe(value);
    }
  }

  private groundedLinks(answer: string) {
    return answer.replace(/(?:https?:\/\/[^\s/()]+)?\/quotes\/[a-zA-Z0-9-]+/g, (url) => {
      const path = url.slice(url.indexOf('/quotes/'));
      return this.sourceLinks.has(path) ? path : '[nem ellenőrzött ajánlathivatkozás]';
    });
  }

  record(tool: string, failed: boolean, readOnly: boolean) {
    if (!failed) return;
    if (readOnly) this.readFailures.add(tool);
    else this.blocked = true;
  }

  get failed() { return this.blocked || this.readFailures.size > 0; }

  text(answer: string, pending = false) {
    if (this.blocked) return 'A művelet sikertelen; nem igazolt végrehajtás.';
    const text = pending ? 'Jóváhagyást igénylő művelet vár rád.' : this.groundedLinks(answer);
    if (!this.readFailures.size) return text;
    return `Az adatellenőrzés során olvasási hiba történt (${[...this.readFailures].join(', ')}). Az alábbi válasz csak a sikeresen lekért adatokra támaszkodhat; a sikertelen szűrés teljes körű helyreállítása nem igazolt.\n\n${text}`;
  }
}