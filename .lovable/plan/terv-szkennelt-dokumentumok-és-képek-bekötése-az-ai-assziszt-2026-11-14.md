# Terv: szkennelt dokumentumok és képek bekötése az AI-asszisztensekbe

## Mi a helyzet most (2026-11-14, csak olvasással ellenőrizve)
- Az AI-asszisztensek ma csak a **szöveges** fájlokat olvassák: PDF szövegréteg, Word, Excel, TXT, CSV. Képet és szkennelt PDF-et nem.
- Dokumentumolvasó eszköze jelenleg csak **Timothynak** (Sales AI) van, Tulajdonos és Sales szerepkörben.
- A tudásbázisban ennyi fájl vár képfelismerésre:
  - **26 szkennelt / szöveg nélküli PDF** (19 levélmelléklet, 7 ügyféldokumentum) — „Ellenőrzést igényel”
  - **82 fotó** levélmellékletként (70 jpg, 12 jpeg, átlag 2–3 MB) — valószínűleg helyszíni fotók
  - **175 png kép** (172 levélmelléklet, 3 ügyfél/projekt) — sok közülük logó vagy aláíráskép lehet
  - **368 kiterjesztés nélküli** kis fájl (átlag 4 KB) — előbb meg kell nézni, mik ezek
  - 11 PDF 5 MB felett — ezeket most sem olvassa
- A levelekbe ágyazott képek (aláírás, logó: kb. 440 db) **nem** kerülnek feldolgozásra.

## Cél
Az AI-asszisztensek a szkennelt PDF-et és a képeket is el tudják olvasni (szöveg, táblázat, kézírás), le tudják írni, mi látható egy fotón, és ezt forrásmegjelöléssel használják a válaszaikban — a mai jogosultságok szerint, ugyanazzal az OpenAI-fiókkal és modellel.

## Szakaszok (mindegyik után STOP és jóváhagyás)

### 1. szakasz — Kérésre olvasás a chatben (nincs adatbázis-változás)
- Ha az asszisztens egy képet vagy szkennelt PDF-et nyit meg, a fájlt elküldi az OpenAI-nak képfelismerésre, és visszakapja:
  - a kiolvasott szöveget (oldalanként),
  - rövid leírást arról, mi látható a képen (pl. „homlokzati fotó állvánnyal”),
  - bizonytalan részek jelölését (olvashatatlan, levágott, kézírás).
- A válaszban külön jelölve: **„AI által kiolvasott, nem ellenőrzött forrás”**. Nem lesz belőle forrástény, amíg ember nem ellenőrzi.
- Semmit nem ment el, csak az adott beszélgetésben használja.
- Ugyanaz a jogosultság, mint ma: csak olyan fájl, amit a felhasználó egyébként is láthat.
- Először **5 TESZT-fájlon próba** (2 szkennelt PDF, 2 fotó, 1 kézírásos), mért költséggel és pontossággal.

### 2. szakasz — Tudásbázis feltöltése képfelismeréssel (Tulajdonos indítja, költségkerettel)
- A Tulajdonos a meglévő tudásbázis-feldolgozó gombbal indítja, kis adagokban.
- Előtte látja: hány fájl, várható költség, kiszűrt fájlok (logók, aláírásképek, túl kicsi képek).
- Sorrend: 26 szkennelt PDF → 82 fotó → png-k szűrés után.
- Költségkeret-túllépés vagy kredithiány esetén biztonságosan leáll; nincs automatikus újrapróbálás.
- Egy fájlt csak egyszer dolgoz fel (azonos tartalom → nem fizetünk újra).
- Utána a többi asszisztens (George, Boss, Scarlet) a tudásbázisból kereshet benne — a saját jogosultsága szerint.

### 3. szakasz — Kép feltöltése közvetlenül a chatbe (döntés kell)
- A felhasználó fotót vagy szkennelt lapot húzhat be a chatbe („Mi van ezen az ajánlaton?”, „Milyen hiba látszik a fotón?”).
- Döntendő: a feltöltött kép **csak a beszélgetésben** éljen, vagy **mentődjön** egy ügyhöz/projekthez a dokumentumtárba.

### 4. szakasz — Kiterjesztés más asszisztensekre és szerepkörökre (döntés kell)
- George és Boss: dokumentumolvasás Tulajdonosnak.
- Scarlet: csak a Marketing saját ügyeinek fájljai.
- Projektvezető: ma nincs saját AI-asszisztense, és a dokumentumolvasó eszköz sem engedélyezett neki — ez jogosultságbővítés lenne.

## Amit NEM csinál
- Nem állít „ellenőrzött” vagy „jóváhagyott” állapotot a kiolvasott tartalomról.
- A képen/dokumentumban lévő utasításokat nem hajtja végre (pl. „küldd el ezt…”); a jóváhagyási kapuk változatlanok.
- Nem módosít ügyfelet, ajánlatot, projektet a kiolvasott adat alapján.
- Nem vált modellt, nem használ más szolgáltatót.

## Döntések, amik kellenek tőled
1. Mehet-e az 1. szakasz (kérésre olvasás + 5 TESZT-fájlos próba)?
2. A 2. szakaszhoz: mekkora legyen a költségkeret (pl. adagonként és összesen)?
3. A png-képeknél: dolgozzuk-e fel őket, vagy csak a fotókat és szkennelt PDF-eket?
4. Chatbe feltöltött kép: csak beszélgetésben, vagy mentve az ügyhöz?
5. Kapjon-e projektvezető hozzáférést a dokumentumolvasáshoz?

## Kockázatok
- **A modell képességét még nem mértük**: ha a jelenlegi modell nem kezel képet, modellváltáshoz külön engedélyed kell — ezt a próba első lépésben kideríti.
- Képeken személyes adat lehet (személyi igazolvány, aláírás): az érzékenyadat-szűrő a kiolvasott szövegre is lefut.
- A költség fájlonként jóval magasabb, mint a sima szövegolvasásnál; ezért van kerettel és adagolva.

---

## Technikai részletek

**1. szakasz**
- `document-extract.server.ts`: új ág képekre (jpg/jpeg/png/webp/gif) és szövegréteg nélküli PDF-oldalakra; a meglévő `extractDocument` szövegkinyerés marad elsődleges, OCR csak ha nincs szöveg vagy kép a fájl.
- Új `vision-extract.server.ts`: közvetlen OpenAI Responses API hívás a meglévő `providers.server.ts` kliensen, `AI_MODEL` a `model-config.ts`-ből (nem új modellbeállítás); `input_image` (base64 data URL) képre, `input_file` PDF-re; strukturált JSON kimenet: `pages[{text, description, uncertain[]}]`.
- `crm_read_document` kap egy `ocr: true` opciót; az eredmény `parser: "openai-vision:<model>"`, `untrusted_content: true`, `source_fact: false`, `limitations` a bizonytalanságokkal. Hash-ellenőrzés és lapozás változatlan.
- `safeMailText` érzékenyadat-szűrő az OCR-szövegre is; az audit csak metaadatot (hash, oldalszám, token, ok/hiba) tárol, tartalmat nem.
- Korlátok: 5 MB marad; képméret felső határ; időkorlát; egy hívás/fájl/oldal.
- Tesztek: unit (képtípus-felismerés, OCR-ág csak szöveg nélküli fájlra, szűrés, hibakezelés, jogosultság-negatív esetek mock providerrel), AI acceptance 21/21 maradjon; a 5 fájlos élő próba fizetős, külön engedéllyel.

**2. szakasz**
- `knowledge/ingest.server.ts`: OCR-ág a meglévő Owner-indítású adagoló futásban; `knowledge_store_result` meglévő paramétereivel (`parser`, `limitations`, `p_chunks`) — várhatóan **nincs sémaváltozás**. Ha a költségnaplózáshoz vagy „AI-kinyert” jelöléshez új oszlop kell, azt előzetes migrációs tervvel külön kérem.
- Szűrés: `inline=true` kihagyva, kis képek (pl. < 30 KB) és ismétlődő hash-ek kihagyva.
- Költség: valós tokenhasználat futásonként a `knowledge_ingest_runs` naplóba; keret elérésekor leállás.

**3–4. szakasz**: chat-feltöltés a meglévő `/api/r2-upload` szabályain vagy tárolás nélkül; szerepkör-kiterjesztés `tool-registry` `allowed_agents/allowed_roles` módosítással — mindkettő jogosultsági döntés, előtte hatáselemzés.

**Visszaállítás**: szakaszonként `git revert <commit>`; az 1. szakasz nem ír adatot.
