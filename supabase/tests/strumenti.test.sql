begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- ===== Rinomina completa: nel database non resta nulla che porti il vecchio nome =====
-- Il vecchio nome e' scritto spezzato ('pas' || 'sat'), cosi' un grep sul repository trova
-- solo i residui veri e non questo test.
select has_table('public', 'strumenti', 'la tabella strumenti esiste');
select has_table('public', 'strumento_parametri', 'la tabella strumento_parametri esiste');
select has_column('public', 'misure', 'strumento_id', 'misure ha strumento_id');
select has_column('public', 'strumento_parametri', 'strumento_id', 'strumento_parametri ha strumento_id');

select is_empty(
  $$ select c.relname from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relname ilike '%' || 'pas' || 'sat' || '%'
     union all
     select a.attname from pg_attribute a join pg_class c on c.oid = a.attrelid
      where c.relnamespace = 'public'::regnamespace and a.attnum > 0 and not a.attisdropped
        and a.attname ilike '%' || 'pas' || 'sat' || '%'
     union all
     select conname from pg_constraint
      where connamespace = 'public'::regnamespace and conname ilike '%' || 'pas' || 'sat' || '%'
     union all
     select policyname from pg_policies
      where schemaname = 'public' and policyname ilike '%' || 'pas' || 'sat' || '%'
     union all
     select tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where c.relnamespace = 'public'::regnamespace and not t.tgisinternal and tgname ilike '%' || 'pas' || 'sat' || '%' $$,
  'nessuna tabella, colonna, vincolo, indice, policy o trigger di public cita il vecchio nome');

select is_empty(
  $$ select p.proname from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and (p.proname ilike '%' || 'pas' || 'sat' || '%' or p.prosrc ilike '%' || 'pas' || 'sat' || '%') $$,
  'nessuna funzione di public cita il vecchio nome (crea_esperimento compresa)');

-- "Ricorda tra piante" e' sparito: il valore mantenuto tra una pianta e l'altra e' una scelta di chi rileva
-- (nel dispositivo), non una proprieta' del parametro.
select hasnt_column('public', 'parametri', 'ricorda_tra_piante', 'parametri non ha piu'' ricorda_tra_piante');

select policies_are('public', 'strumenti', array['strumenti_membro'],
  'strumenti ha la sola policy strumenti_membro');
select policies_are('public', 'strumento_parametri', array['strumento_parametri_membro'],
  'strumento_parametri ha la sola policy strumento_parametri_membro');

-- Il grant per colonna di misure segue la rinomina: strumento_id si aggiorna (l'upsert di
-- PostgREST lo mette nel SET), creato_da no.
select ok(has_column_privilege('authenticated', 'public.misure', 'strumento_id', 'UPDATE'),
  'authenticated aggiorna misure.strumento_id');
select ok(not has_column_privilege('authenticated', 'public.misure', 'creato_da', 'UPDATE'),
  'authenticated non aggiorna misure.creato_da');

select has_trigger('public', 'strumenti', 'guardia_esperimento_id',
  'la guardia su esperimento_id resta su strumenti');
select has_trigger('public', 'strumento_parametri', 'guardia_esperimento_id',
  'la guardia su esperimento_id resta su strumento_parametri');

-- Fixture (superuser): un utente invitato.
insert into inviti (email, codice) values ('a.strumenti@test.it', 'CODICEA2');
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('05000000-0000-0000-0000-000000000001', 'a.strumenti@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'CODICEA2'));

-- ===== Percorso dell'app, come utente autenticato: crea_esperimento, poi una misura =====
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '05000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

-- Primo esperimento: uno strumento senza tipo ne' archiviato (valgono i default) e una
-- tabella fenologica archiviata.
select is(
  crea_esperimento('{
    "esperimento": {"id": "e5000000-0000-0000-0000-000000000001", "nome": "Strumenti 1", "data_inizio": null, "note": "", "stato": "in_corso"},
    "fattori": [{"id": "f5000000-0000-0000-0000-000000000001", "nome": "Dose", "ordine": 0,
                 "livelli": [{"id": "15000000-0000-0000-0000-000000000001", "nome": "Alta", "ordine": 0}]}],
    "trattamenti": [{"id": "75000000-0000-0000-0000-000000000001", "etichetta": "Alta", "ordine": 0,
                     "livello_ids": ["15000000-0000-0000-0000-000000000001"]}],
    "piante": [{"id": "b5000000-0000-0000-0000-000000000001", "trattamento_id": "75000000-0000-0000-0000-000000000001",
                "etichetta": "1", "blocco": null, "ordine": 0}],
    "parametri": [
      {"id": "c5000000-0000-0000-0000-000000000001", "nome": "Altezza", "unita": "cm", "tipo": "numero", "ordine": 0,
       "archiviato": false, "progressivo": false, "n_letture": 1,
       "valore_min": null, "valore_max": null, "sotto_campi": []},
      {"id": "c5000000-0000-0000-0000-000000000002", "nome": "Fioritura", "unita": null, "tipo": "sino", "ordine": 1,
       "archiviato": false, "progressivo": false, "n_letture": 1,
       "valore_min": null, "valore_max": null, "sotto_campi": []}],
    "strumenti": [
      {"id": "d5000000-0000-0000-0000-000000000001", "nome": "Righello", "icona": "ruler", "ordine": 0,
       "parametri": [{"parametro_id": "c5000000-0000-0000-0000-000000000001", "obbligatorio": true, "ordine": 0}]},
      {"id": "d5000000-0000-0000-0000-000000000002", "nome": "Tabella fenologica", "icona": null, "ordine": 1,
       "tipo": "fenologico", "archiviato": true,
       "parametri": [{"parametro_id": "c5000000-0000-0000-0000-000000000002", "obbligatorio": false, "ordine": 0}]}]
  }'::jsonb),
  'e5000000-0000-0000-0000-000000000001'::uuid,
  'crea_esperimento legge bozza->strumenti');

select results_eq(
  $$ select id, nome, icona, ordine, tipo, archiviato from strumenti
      where esperimento_id = 'e5000000-0000-0000-0000-000000000001' order by ordine $$,
  $$ values ('d5000000-0000-0000-0000-000000000001'::uuid, 'Righello'::text, 'ruler'::text, 0, 'strumento'::text, false),
            ('d5000000-0000-0000-0000-000000000002', 'Tabella fenologica', null, 1, 'fenologico', true) $$,
  'gli strumenti hanno i campi della bozza; tipo e archiviato prendono i default se mancano');

select results_eq(
  $$ select strumento_id, parametro_id, obbligatorio, ordine from strumento_parametri
      where esperimento_id = 'e5000000-0000-0000-0000-000000000001' order by strumento_id $$,
  $$ values ('d5000000-0000-0000-0000-000000000001'::uuid, 'c5000000-0000-0000-0000-000000000001'::uuid, true, 0),
            ('d5000000-0000-0000-0000-000000000002', 'c5000000-0000-0000-0000-000000000002', false, 0) $$,
  'crea_esperimento collega i parametri agli strumenti');

select lives_ok(
  $$ insert into misure (id, esperimento_id, pianta_id, strumento_id, data_rilievo, ora, valori)
     values ('a5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001',
             'b5000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001',
             '2026-10-29', '09:00', '{"c5000000-0000-0000-0000-000000000001": [10]}') $$,
  'una misura con strumento_id si salva nell''esperimento appena creato');

select lives_ok(
  $$ insert into misure (id, esperimento_id, pianta_id, strumento_id, data_rilievo, ora, valori)
     values ('a5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001',
             'b5000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001',
             '2026-10-29', '09:05', '{"c5000000-0000-0000-0000-000000000001": [11]}')
     on conflict (id) do update set
       id = excluded.id, esperimento_id = excluded.esperimento_id, pianta_id = excluded.pianta_id,
       strumento_id = excluded.strumento_id, data_rilievo = excluded.data_rilievo, ora = excluded.ora,
       valori = excluded.valori $$,
  'upsert di una misura con strumento_id nel SET (come PostgREST): riesce');

select results_eq(
  $$ select strumento_id, ora, valori from misure where id = 'a5000000-0000-0000-0000-000000000001' $$,
  $$ values ('d5000000-0000-0000-0000-000000000001'::uuid, '09:05'::time(0),
             '{"c5000000-0000-0000-0000-000000000001": [11]}'::jsonb) $$,
  'la misura salvata porta lo strumento e i valori aggiornati');

select isnt_empty(
  $$ update strumenti set archiviato = true
      where id = 'd5000000-0000-0000-0000-000000000001' returning id $$,
  'uno strumento si archivia');

-- Secondo esperimento dello stesso utente, per i riferimenti incrociati.
select is(
  crea_esperimento('{
    "esperimento": {"id": "e5000000-0000-0000-0000-000000000002", "nome": "Strumenti 2", "data_inizio": null, "note": "", "stato": "in_corso"},
    "strumenti": [{"id": "d5000000-0000-0000-0000-000000000003", "nome": "Righello", "icona": null, "ordine": 0,
                   "tipo": "strumento", "archiviato": false, "parametri": []}]
  }'::jsonb),
  'e5000000-0000-0000-0000-000000000002'::uuid,
  'crea_esperimento con un solo strumento senza parametri');

select throws_ok(
  $$ insert into misure (id, esperimento_id, pianta_id, strumento_id, data_rilievo, ora)
     values ('a5000000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-000000000001',
             'b5000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000003',
             '2026-10-29', '10:00') $$,
  '23503', null,
  'una misura non puo'' usare lo strumento di un altro esperimento');

select throws_ok(
  $$ update strumenti set esperimento_id = 'e5000000-0000-0000-0000-000000000001'
      where id = 'd5000000-0000-0000-0000-000000000003' $$,
  'P0001', 'ESPERIMENTO_NON_MODIFICABILE',
  'uno strumento non passa a un altro esperimento');

select throws_ok(
  $$ update strumento_parametri set esperimento_id = 'e5000000-0000-0000-0000-000000000002'
      where strumento_id = 'd5000000-0000-0000-0000-000000000001' $$,
  'P0001', 'ESPERIMENTO_NON_MODIFICABILE',
  'un collegamento strumento-parametro non passa a un altro esperimento');

-- ===== Vincoli nuovi =====
select throws_ok(
  $$ insert into strumenti (esperimento_id, nome, ordine, tipo)
     values ('e5000000-0000-0000-0000-000000000001', 'Seconda tabella', 2, 'fenologico') $$,
  '23505', null,
  'una seconda tabella fenologica nello stesso esperimento: rifiutata');

select lives_ok(
  $$ insert into strumenti (esperimento_id, nome, ordine, tipo)
     values ('e5000000-0000-0000-0000-000000000002', 'Tabella fenologica', 1, 'fenologico') $$,
  'un altro esperimento ha la sua tabella fenologica');

select throws_ok(
  $$ insert into strumento_parametri (esperimento_id, strumento_id, parametro_id, ordine)
     values ('e5000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000002',
             'c5000000-0000-0000-0000-000000000001', 1) $$,
  '23505', null,
  'lo stesso parametro in due strumenti: rifiutato');

select throws_ok(
  $$ insert into strumenti (esperimento_id, nome, ordine, tipo)
     values ('e5000000-0000-0000-0000-000000000002', 'Strano', 3, 'altro') $$,
  '23514', null,
  'tipo ''altro'' non e'' ammesso');

-- crea_esperimento con due tabelle fenologiche fallisce e non lascia nulla.
select throws_ok(
  $$ select crea_esperimento('{
       "esperimento": {"id": "e5000000-0000-0000-0000-000000000003", "nome": "Due tabelle", "data_inizio": null, "note": "", "stato": "in_corso"},
       "strumenti": [
         {"id": "d5000000-0000-0000-0000-000000000004", "nome": "A", "icona": null, "ordine": 0, "tipo": "fenologico", "parametri": []},
         {"id": "d5000000-0000-0000-0000-000000000005", "nome": "B", "icona": null, "ordine": 1, "tipo": "fenologico", "parametri": []}]
     }'::jsonb) $$,
  '23505', null,
  'crea_esperimento con due tabelle fenologiche fallisce');

-- Una bozza senza il campo ricorda_tra_piante crea i parametri (le bozze di sopra), e una bozza di un client
-- vecchio che lo porta ancora non rompe la creazione: la chiave in piu' si ignora.
select lives_ok(
  $$ select crea_esperimento('{
       "esperimento": {"id": "e5000000-0000-0000-0000-000000000004", "nome": "Client vecchio", "data_inizio": null, "note": "", "stato": "in_corso"},
       "parametri": [{"id": "c5000000-0000-0000-0000-000000000004", "nome": "Temp aria", "unita": "C", "tipo": "numero", "ordine": 0,
                      "archiviato": false, "progressivo": false, "ricorda_tra_piante": true, "n_letture": 1,
                      "valore_min": null, "valore_max": null, "sotto_campi": []}]
     }'::jsonb) $$,
  'crea_esperimento ignora il campo ricorda_tra_piante di una bozza vecchia');

select is(
  (select count(*)::int from parametri where esperimento_id = 'e5000000-0000-0000-0000-000000000004'),
  1,
  'il parametro della bozza vecchia e'' stato creato');

reset role;
select is(
  (select count(*)::int from (
     select 1 from esperimenti where id = 'e5000000-0000-0000-0000-000000000003'
     union all select 1 from strumenti where esperimento_id = 'e5000000-0000-0000-0000-000000000003'
   ) x),
  0,
  'della bozza con due tabelle fenologiche non resta nulla');

select * from finish();
rollback;
