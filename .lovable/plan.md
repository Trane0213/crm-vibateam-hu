# Projekt visszaállítás `uepqejecsiuhodegbcff`-ra (feltételezés-mentes verzió)

Cél: pontosan M6-végi állapot. Semmit sem feltételezek, minden lépés kimenetét megvárom, mielőtt a következőt indítom.

---

## Lépések (szigorú sorrendben, egymásra várva)

### 1. `.env` átírása
Mind a 6 sor `uepqejecsiuhodegbcff`-ra:
```
SUPABASE_PROJECT_ID="uepqejecsiuhodegbcff"
SUPABASE_PUBLISHABLE_KEY="sb_publishable_rSXwIJI7nXcp12wzqOlODw_PLBdBvvs"
SUPABASE_URL="https://uepqejecsiuhodegbcff.supabase.co"
VITE_SUPABASE_PROJECT_ID="uepqejecsiuhodegbcff"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_rSXwIJI7nXcp12wzqOlODw_PLBdBvvs"
VITE_SUPABASE_URL="https://uepqejecsiuhodegbcff.supabase.co"
```

### 2. `supabase/config.toml` átírása
`project_id = "uepqejecsiuhodegbcff"`.

### 3. Dev szerver újraindítása
`code--restart_dev_server`, hogy a Vite az új `.env`-et betöltse.

### 4. Ellenőrzés — build és runtime (feltételezés nélkül)
Csak read-only megfigyelés, semmit sem módosítok ebben a lépésben:

a) **Build state:** megnézem a Lovable által futtatott automatikus build/typecheck kimenetét. Ha `types.ts`-re hivatkozó TS hiba van → ez lesz a jel, hogy 5. lépés kell. Ha nincs → `types.ts`-hez **nem nyúlok**.

b) **Runtime state:** preview-n `/today`, `/ai-assistants`, `/settings/gmail`, `/settings/google-ads` — figyelem a runtime errort. A jelenlegi `agent_runs start: Invalid API key` várhatóan eltűnik, mert az `.env` most már a régi projektre mutat és a `SUPABASE_SERVICE_ROLE_KEY`/`GMAIL_SUPABASE_SERVICE_KEY` értéke a helyreállítás után tesztelhető.

c) **Ha runtime még mindig `Invalid API key`:** akkor és csak akkor javaslom a `SUPABASE_SERVICE_ROLE_KEY` és/vagy `SUPABASE_DB_URL` cseréjét (`secrets--update_secret`), külön megállva jóváhagyásra.

### 5. `types.ts` — csak ha a 4a. blokkolja
**Csak akkor**, ha a 4a. konkrét, `types.ts`-re visszavezethető build/TS hibát mutat:
- Nem írok kézzel semmit.
- Te futtatod lokálisan: `npx supabase gen types typescript --project-id uepqejecsiuhodegbcff > src/integrations/supabase/types.ts`, vagy elküldöd a CLI kimenetét, én változtatás nélkül beemelem.
- Ha 4a. tiszta → `types.ts`-hez nem nyúlok.

---

## Amit NEM teszek

- Nem feltételezem, hogy secretet kell cserélni — megvárom a runtime bizonyítékot.
- Nem feltételezem, hogy `types.ts` blokkolja a buildet — megvárom a build kimenetét.
- Nem generálok kézzel `types.ts`-t soha.
- Nem hívok Lovable Cloud DB tool-t (`supabase--migration`, `--insert`, `--read_query`).
- Nem szüneteltetem / törlöm a `hbfdvkfzjqqnedvirjue` Cloud instance-ot.
- Nem nyúlok a Supabase kliens/middleware fájlokhoz — env-vezéreltek.
- Nem indítom az M7 / KG-1-et.

---

## Végállapot definíció

Kész, ha:
1. `.env` + `config.toml` `uepqejecsiuhodegbcff`.
2. `types.ts` állapota: érintetlen VAGY hivatalos CLI-ből regenerált — a 4a. döntése alapján.
3. Preview runtime tiszta a fenti 4 oldalon, `agent_runs start: Invalid API key` eltűnt.
4. A build/typecheck zöld.

Ezt jelentem, és külön üzenetben, külön jóváhagyással kezdjük az M7-et.
