# AI OS 2.0 — 3. szakasz: George és a szakértő AI-k strukturált együttműködése (2026-11-13)

Állapot: **RÉSZBEN KÉSZ** — a működés kész és valós OpenAI-futással igazolt; a bejelentkezett felületi próba NEM TESZTELT.

## Mi változott
- `handoff_to`: már nem csak jelzés — George ténylegesen lefuttatja a szakértőt (Scarlet/Timothy/Boss/Michael) a felhasználó jogosultságával, egy szint mélyen.
- Konzultációs mód: a szakértő csak olvasó eszközöket kap (jóváhagyásköteles, dry-run, memóriaírás, továbbadás kizárva, szerveroldalon is tiltva).
- Egységes jelentés: status, summary, findings (source_fact / ai_inference / unverified + források), recommended_actions (mind emberi döntés), open_questions, confidence.
- Forrás-ellenőrzés: „source_fact” csak akkor marad, ha minden hivatkozott azonosító megjelent az adott futás eszköz-eredményeiben; különben „unverified”.
- Szerepkör-hozzáférés: a célszakértőre is érvényes az agent_role_access / Michael = Owner szabály.
- Hibajegy-vizsgálat: George olvasó módban fut, kötelezően megkérdezi az illetékes szakértőt, szükség szerint másokat is; minden hozzájárulás az `issue_report_findings` táblába kerül. Tulajdonos más jegyén végzett vizsgálatának részletei csak a tulajdonosnak láthatók.
- /help: szakértői jelentéskártyák forrásjelöléssel, „Újravizsgálat” és „Utóellenőrzés kérése George-tól”. Ismétlésvédelem jegyenként 5 futás.
- Modell változatlan: közvetlen OpenAI API, gpt-6-astra, high.

## Tesztek
- 824 unit teszt PASS (ebből 14 új: konzultációs eszközkorlát, forrás-ellenőrzés, jóváhagyás-kényszer).
- 21 AI acceptance forgatókönyv PASS; TypeScript-ellenőrzés PASS.
- Valós OpenAI-futás (Owner-azonosítóval, szerveroldali kulccsal): George → Timothy konzultáció lefutott (218 mp), Timothy 11 különböző olvasó eszközt használt, 0 jóváhagyás/írás; 30 ellenőrzött forrás-hivatkozás, 2 nem ellenőrzött állítás helyesen jelölve. Futás: 68977cbe… (George), 92e3664d… (Timothy).
  - Korlát: ez a futás szolgáltatói kulccsal ment, így a felhasználói RLS-t nem gyakorolta; a `crm_sales_assignees` eszköz emiatt kétszer hibát adott.
- Visszagörgetett adatbázis-próba (issue_report_findings): bejelentő 1 (csak saját kérésű), tulajdonos 2, más Marketing 0, más Sales 0, kliensoldali írás tiltva, anon 0 — PASS.
- NEM TESZTELT: bejelentkezett /help felület és szerepkörös (Sales/Marketing/PM) élő konzultáció — nincs bejelentkezett munkamenet.
