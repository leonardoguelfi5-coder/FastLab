begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- Fixture (superuser): due utenti invitati, A e B.
insert into inviti (email) values ('a.rls@test.it'), ('b.rls@test.it');
insert into auth.users (id, email, aud, role, instance_id) values
  ('0a000000-0000-0000-0000-000000000001', 'a.rls@test.it', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('0b000000-0000-0000-0000-000000000001', 'b.rls@test.it', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

-- ===== A crea il proprio esperimento (bozza minima) =====
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '0a000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

select is(
  crea_esperimento('{
    "esperimento": {"id": "ea000000-0000-0000-0000-000000000001", "nome": "Esperimento di A", "data_inizio": null, "note": "", "stato": "in_corso"},
    "fattori": [{"id": "fa000000-0000-0000-0000-000000000001", "nome": "Dose", "ordine": 0,
                 "livelli": [{"id": "1a000000-0000-0000-0000-000000000001", "nome": "Alta", "ordine": 0}]}],
    "trattamenti": [{"id": "7a000000-0000-0000-0000-000000000001", "etichetta": "Alta", "ordine": 0,
                     "livello_ids": ["1a000000-0000-0000-0000-000000000001"]}],
    "piante": [{"id": "ba000000-0000-0000-0000-000000000001", "trattamento_id": "7a000000-0000-0000-0000-000000000001",
                "etichetta": "1", "blocco": null, "ordine": 0}],
    "parametri": [{"id": "ca000000-0000-0000-0000-000000000001", "nome": "Altezza", "unita": "cm", "tipo": "numero", "ordine": 0,
                   "archiviato": false, "progressivo": false, "ricorda_tra_piante": false, "n_letture": 1,
                   "valore_min": null, "valore_max": null, "sotto_campi": []}],
    "passate": [{"id": "da000000-0000-0000-0000-000000000001", "nome": "Settimanale", "icona": null, "ordine": 0,
                 "parametri": [{"parametro_id": "ca000000-0000-0000-0000-000000000001", "obbligatorio": false, "ordine": 0}]}]
  }'::jsonb),
  'ea000000-0000-0000-0000-000000000001'::uuid,
  'A crea un esperimento con crea_esperimento');

select lives_ok(
  $$ insert into misure (id, esperimento_id, pianta_id, passata_id, data_rilievo, ora, valori)
     values ('ab000000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000001',
             'ba000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000001',
             '2026-10-28', '09:00', '{"ca000000-0000-0000-0000-000000000001": [10]}') $$,
  'A inserisce una misura nel proprio esperimento');

select is(
  array[(select count(*)::int from esperimenti),
        (select count(*)::int from piante),
        (select count(*)::int from parametri)],
  array[1, 1, 1],
  'A vede 1 riga in esperimenti, piante e parametri');

select is(
  (select count(*)::int from membri_esperimento
    where esperimento_id = 'ea000000-0000-0000-0000-000000000001'
      and utente_id = '0a000000-0000-0000-0000-000000000001'
      and ruolo = 'proprietario'),
  1,
  'A vede la propria riga in membri_esperimento, come proprietario');

select isnt_empty(
  $$ update piante set blocco = 'I' where id = 'ba000000-0000-0000-0000-000000000001' returning id $$,
  'A modifica le proprie piante');

-- ===== B non vede e non tocca nulla di A =====
select set_config('request.jwt.claims',
  json_build_object('sub', '0b000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

select is(
  array[(select count(*)::int from esperimenti),
        (select count(*)::int from piante),
        (select count(*)::int from parametri)],
  array[0, 0, 0],
  'B vede 0 righe in esperimenti, piante e parametri');

select is(
  array[(select count(*)::int from fattori),
        (select count(*)::int from livelli),
        (select count(*)::int from trattamenti),
        (select count(*)::int from trattamento_livelli),
        (select count(*)::int from passate),
        (select count(*)::int from passata_parametri),
        (select count(*)::int from misure)],
  array[0, 0, 0, 0, 0, 0, 0],
  'B vede 0 righe in tutte le altre tabelle di A');

select is(
  (select count(*)::int from membri_esperimento),
  0,
  'B non vede la riga di A in membri_esperimento');

select is_empty(
  $$ update piante set etichetta = 'x' returning id $$,
  'B: update piante set etichetta = ''x'' tocca 0 righe');

select is_empty(
  $$ delete from misure returning id $$,
  'B: delete delle misure di A tocca 0 righe');

select is_empty(
  $$ delete from esperimenti returning id $$,
  'B: delete dell''esperimento di A tocca 0 righe');

select throws_ok(
  $$ insert into misure (id, esperimento_id, pianta_id, passata_id, data_rilievo, ora)
     values ('ab000000-0000-0000-0000-000000000002', 'ea000000-0000-0000-0000-000000000001',
             'ba000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000001',
             '2026-10-28', '10:00') $$,
  '42501', null,
  'B non inserisce misure nell''esperimento di A');

select throws_ok(
  $$ insert into piante (esperimento_id, trattamento_id, etichetta, ordine)
     values ('ea000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000001', '2', 1) $$,
  '42501', null,
  'B non inserisce piante nell''esperimento di A');

select throws_ok(
  $$ insert into membri_esperimento (esperimento_id, utente_id, ruolo)
     values ('ea000000-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000001', 'collaboratore') $$,
  '42501', null,
  'B non si aggiunge ai membri dell''esperimento di A');

select throws_ok(
  $$ insert into esperimenti (nome, creato_da) values ('Finto', '0a000000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'B non crea esperimenti a nome di A');

select is(
  crea_esperimento('{
    "esperimento": {"id": "eb000000-0000-0000-0000-000000000001", "nome": "Esperimento di B", "data_inizio": null, "note": "", "stato": "in_corso"},
    "fattori": [{"id": "fb000000-0000-0000-0000-000000000001", "nome": "Dose", "ordine": 0,
                 "livelli": [{"id": "1b000000-0000-0000-0000-000000000001", "nome": "Alta", "ordine": 0}]}],
    "trattamenti": [{"id": "7b000000-0000-0000-0000-000000000001", "etichetta": "Alta", "ordine": 0,
                     "livello_ids": ["1b000000-0000-0000-0000-000000000001"]}],
    "piante": [{"id": "bb000000-0000-0000-0000-000000000001", "trattamento_id": "7b000000-0000-0000-0000-000000000001",
                "etichetta": "1", "blocco": null, "ordine": 0}],
    "parametri": [{"id": "cb000000-0000-0000-0000-000000000001", "nome": "Altezza", "unita": "cm", "tipo": "numero", "ordine": 0,
                   "archiviato": false, "progressivo": false, "ricorda_tra_piante": false, "n_letture": 1,
                   "valore_min": null, "valore_max": null, "sotto_campi": []}],
    "passate": [{"id": "db000000-0000-0000-0000-000000000001", "nome": "Settimanale", "icona": null, "ordine": 0,
                 "parametri": [{"parametro_id": "cb000000-0000-0000-0000-000000000001", "obbligatorio": false, "ordine": 0}]}]
  }'::jsonb),
  'eb000000-0000-0000-0000-000000000001'::uuid,
  'B crea il proprio esperimento');

select throws_ok(
  $$ insert into misure (id, esperimento_id, pianta_id, passata_id, data_rilievo, ora)
     values ('bc000000-0000-0000-0000-000000000001', 'eb000000-0000-0000-0000-000000000001',
             'ba000000-0000-0000-0000-000000000001', 'db000000-0000-0000-0000-000000000001',
             '2026-10-28', '10:00') $$,
  '23503', null,
  'B non usa la pianta di A in una misura del proprio esperimento');

select throws_ok(
  $$ update piante set esperimento_id = 'ea000000-0000-0000-0000-000000000001'
      where id = 'bb000000-0000-0000-0000-000000000001' $$,
  '42501', null,
  'B non sposta le proprie righe nell''esperimento di A');

select results_eq(
  $$ select id from riepilogo_esperimenti() $$,
  $$ values ('eb000000-0000-0000-0000-000000000001'::uuid) $$,
  'riepilogo_esperimenti di B contiene solo il suo esperimento');

select is_empty(
  $$ select * from parametri_con_dati('ea000000-0000-0000-0000-000000000001') $$,
  'parametri_con_dati non rivela nulla a B dell''esperimento di A');

select is_empty(
  $$ select * from piante_con_dati('ea000000-0000-0000-0000-000000000001') $$,
  'piante_con_dati non rivela nulla a B dell''esperimento di A');

-- ===== Di nuovo A: i suoi dati sono intatti =====
select set_config('request.jwt.claims',
  json_build_object('sub', '0a000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select p.etichetta,
            (select count(*)::int from misure m where m.esperimento_id = p.esperimento_id)
       from piante p where p.id = 'ba000000-0000-0000-0000-000000000001' $$,
  $$ values ('1'::text, 1) $$,
  'la pianta e la misura di A sono intatte dopo i tentativi di B');

select results_eq(
  $$ select id from riepilogo_esperimenti() $$,
  $$ values ('ea000000-0000-0000-0000-000000000001'::uuid) $$,
  'riepilogo_esperimenti di A contiene solo il suo esperimento');

select is(
  (select count(*)::int from membri_esperimento),
  1,
  'A non vede la riga di B in membri_esperimento');

select lives_ok(
  $$ delete from esperimenti where id = 'ea000000-0000-0000-0000-000000000001' $$,
  'A elimina il proprio esperimento con dati');

reset role;
select is(
  (select count(*)::int from (
     select 1 from esperimenti where id = 'ea000000-0000-0000-0000-000000000001'
     union all select 1 from membri_esperimento where esperimento_id = 'ea000000-0000-0000-0000-000000000001'
     union all select 1 from misure where esperimento_id = 'ea000000-0000-0000-0000-000000000001'
     union all select 1 from piante where esperimento_id = 'ea000000-0000-0000-0000-000000000001'
     union all select 1 from parametri where esperimento_id = 'ea000000-0000-0000-0000-000000000001'
     union all select 1 from passate where esperimento_id = 'ea000000-0000-0000-0000-000000000001'
   ) x),
  0,
  'l''eliminazione di A va a cascata anche sotto RLS');

-- ===== anon: nessun accesso =====
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

select throws_ok(
  $$ select count(*) from esperimenti $$,
  '42501', null,
  'anon non legge gli esperimenti');

select throws_ok(
  $$ select count(*) from misure $$,
  '42501', null,
  'anon non legge le misure');

select throws_ok(
  $$ select crea_esperimento('{"esperimento": {"id": "e0000000-0000-0000-0000-000000000009", "nome": "Anon"}}'::jsonb) $$,
  '42501', null,
  'anon non chiama crea_esperimento');

select throws_ok(
  $$ select * from riepilogo_esperimenti() $$,
  '42501', null,
  'anon non chiama riepilogo_esperimenti');

select throws_ok(
  $$ select is_membro('eb000000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'anon non chiama is_membro');

reset role;
select * from finish();
rollback;
