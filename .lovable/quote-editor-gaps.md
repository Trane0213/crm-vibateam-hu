# Ajánlat modul — hiányzó adatbázis mezők (Sprint 1 után)

A Sprint 1 szerkesztő kizárólag a jelenleg létező oszlopokra épít.
Az alábbi mezőkre a napi ajánlatkészítéshez szükség lesz, de ezek csak
egy KÉSŐBBI, egyetlen additív SQL migrációval kerülnek be — nem
darabonként. Addig UI-ban nem jelennek meg, hogy ne legyen félrevezető,
nem menthető mező.

## `public.quotes` — hiányzó oszlopok

| Mező | Típus | Miért kell |
|------|-------|-----------|
| `title` | text | Az ajánlat rövid megnevezése (pl. „Alfa General – iroda klíma"), listákban és PDF-en. |
| `description` | text | Rövid bevezető szöveg / munkaleírás (a fejlécben látszik). |
| `location` | text | Teljesítés helye (kivitelezési cím), gyakran eltér a cég címétől. |
| `valid_until` | date | Ajánlati érvényesség — kötelező információ az ügyfél felé. |
| `payment_terms` | text | Fizetési feltételek szabad szövege (pl. „50% előleg, 50% átadáskor"). |
| `discount_amount` | numeric(14,2) | Fix összegű kedvezmény az egész ajánlaton. |
| `advance_amount` | numeric(14,2) | Előleg összege HUF-ban. |
| `vat_rate` | numeric(5,2) | ÁFA kulcs (default 27). Enélkül csak nettót tudunk mutatni. |
| `currency` | text (default 'HUF') | Előkészítés több devizára; most fix HUF. |
| `notes` | text | Publikus megjegyzés az ügyfél felé. |
| `internal_notes` | text | Belső, ügyfél számára nem látható jegyzet. |
| `intro_text` | text | Nyitó szöveg a kiküldött PDF-hez (Sprint 2). |
| `quote_number` | text (unique) | Emberi olvasható ajánlatszám (pl. `2026/001`). |
| `sent_at` | timestamptz | Kiküldés időpontja. Státusz-váltáskor kellene írni. |
| `accepted_at` | timestamptz | Ügyfél általi elfogadás időpontja. |
| `rejected_at` | timestamptz | Elutasítás időpontja. |
| `updated_at` | timestamptz | Módosításkövetés / cache invalidáció. |

## `public.quote_items` — hiányzó oszlopok

| Mező | Típus | Miért kell |
|------|-------|-----------|
| `item_type` | text (`labor` \| `material` \| `other`) | Kategorizálás — az értékesítő így tudja külön kezelni az anyag- és munkadíj tételeket. |
| `description` | text | Hosszabb, több soros tétel-leírás a névhez képest. |
| `sort_order` | integer | Manuális sorrend (jelenleg `created_at`-tal helyettesítjük). |
| `vat_rate` | numeric(5,2) | Tételenkénti ÁFA kulcs (ha eltér az ajánlat-szintűtől). |
| `discount_amount` | numeric(14,2) | Tétel-szintű kedvezmény. |

## Nem oszlop-szintű hiány

- Verzió-létrehozás RPC (`quotes_new_version(lead_id)`) — jelenleg a
  frontend csinálja két külön UPDATE + INSERT-tel. Sprint 2-ben egyetlen
  atomikus RPC kellene, hogy a `uq_quotes_lead_current` unique index
  garantáltan ne sérüljön.
- Ajánlat mellékletek táblája (`quote_attachments`) — Sprint 2, R2 tárolással.
- PDF generáló szerver-fn — Sprint 2.

## Munkamenet

1. Sprint 1 UI éles teszt (jelenlegi séma).
2. A fenti lista véglegesítése a felhasználóval.
3. Egyetlen additív migráció: `database/YYYY-MM-DD_quotes_editor_fields.sql`.
4. A meglévő szerkesztő fokozatos bővítése az új mezőkkel — átírás nélkül.