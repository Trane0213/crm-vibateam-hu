-- Rollback: hideg e-mail megkeresés jelölés + kontaktnév kitöltés (2026-11-06)
update companies set notes = nullif(regexp_replace(notes, '(\n\n)?\[GMAIL_MEGKERESES_2026-11-06\][\s\S]*$', ''), '')
where notes like '%[GMAIL_MEGKERESES_2026-11-06]%';
-- Kontaktnevek: a korábbi név a cég neve volt
update contacts ct set name = co.name from companies co
where co.id = ct.company_id and co.created_at::date = '2026-11-06'
  and lower(replace(ct.name,' ','')) = regexp_replace(split_part(ct.email,'@',1),'[._-]','','g');
