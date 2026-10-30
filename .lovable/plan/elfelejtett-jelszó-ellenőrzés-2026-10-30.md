# Elfelejtett jelszó – ellenőrzés

Az elfelejtett jelszó funkció már megvan a CRM-ben:
- A bejelentkezési oldalon van egy „Elfelejtett jelszó” link.
- Az e-mail cím megadása után a rendszer küld egy levelet a jelszó visszaállításához.
- A levélben lévő link egy új oldalra visz, ahol meg lehet adni az új jelszót.

## Mit csinálok jóváhagyás után
1. Böngészőben végigmegyek a folyamaton: link → e-mail megadása → visszajelzés → új jelszó oldal.
2. Ha valami nem működik vagy félrevezető a szöveg, javítom (csak ezen a két oldalon).
3. Megadom, mit kell beállítani a Supabase-ben, hogy a levélben lévő link az élő oldalra mutasson:
   Authentication → URL Configuration → Redirect URLs: `https://crm-vibateam-hu.lovable.app/reset-password` és az előnézet címe.

## Amit nem módosítok
Jogosultságok, adatbázis, egyéb oldalak.
