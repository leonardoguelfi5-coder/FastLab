begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

-- ===== Struttura =====
select has_table('public', 'catalogo_strumenti', 'la tabella catalogo_strumenti esiste');
select ok((select relrowsecurity from pg_class where oid = 'public.catalogo_strumenti'::regclass),
  'catalogo_strumenti ha RLS attiva');
select has_column('public', 'strumenti', 'catalogo_id', 'strumenti ha catalogo_id');
select has_column('public', 'parametri', 'catalogo_chiave', 'parametri ha catalogo_chiave');
select col_is_null('public', 'strumenti', 'catalogo_id', 'catalogo_id e'' facoltativo');
select col_is_null('public', 'parametri', 'catalogo_chiave', 'catalogo_chiave e'' facoltativo');
select fk_ok('public', 'strumenti', 'catalogo_id', 'public', 'catalogo_strumenti', 'id',
  'strumenti.catalogo_id punta a catalogo_strumenti');
select policies_are('public', 'catalogo_strumenti',
  array['catalogo_strumenti_select', 'catalogo_strumenti_insert', 'catalogo_strumenti_update'],
  'catalogo_strumenti ha le sole policy di select, insert e update (nessuna di delete)');
select has_trigger('public', 'catalogo_strumenti', 'catalogo_strumenti_aggiornato_il',
  'aggiornato_il segue ogni modifica');
select fk_ok('public', 'catalogo_strumenti', 'creato_da', 'auth', 'users', 'id',
  'catalogo_strumenti.creato_da punta a auth.users');

-- Privilegi: authenticated legge, inserisce e aggiorna (non creato_da), non elimina.
select ok(not has_table_privilege('authenticated', 'public.catalogo_strumenti', 'DELETE'),
  'authenticated non ha il privilegio di DELETE sul catalogo');
select ok(not has_column_privilege('authenticated', 'public.catalogo_strumenti', 'creato_da', 'UPDATE'),
  'authenticated non aggiorna catalogo_strumenti.creato_da');
select ok(has_column_privilege('authenticated', 'public.catalogo_strumenti', 'parametri', 'UPDATE')
          and has_column_privilege('authenticated', 'public.catalogo_strumenti', 'id', 'UPDATE')
          and has_column_privilege('authenticated', 'public.catalogo_strumenti', 'aggiornato_il', 'UPDATE'),
  'authenticated aggiorna le altre colonne (anche id e aggiornato_il, che l''upsert mette nel SET)');
select ok(not has_table_privilege('authenticated', 'public.catalogo_strumenti', 'TRUNCATE'),
  'authenticated non svuota il catalogo con truncate');

-- ===== I semi =====
select results_eq(
  $$ select id, nome, icona, archiviato, creato_da from catalogo_strumenti order by id $$,
  $$ values ('c0000000-0000-0000-0000-000000000001'::uuid, 'SPAD'::text, '💚'::text, false, null::uuid),
            ('c0000000-0000-0000-0000-000000000002', 'Termometro', '🌡', false, null),
            ('c0000000-0000-0000-0000-000000000003', 'Ciras', '🍃', false, null),
            ('c0000000-0000-0000-0000-000000000004', 'Metro', '📏', false, null),
            ('c0000000-0000-0000-0000-000000000005', 'Calibro', '📐', false, null) $$,
  'ci sono i 5 semi, con id fissi e senza autore');

select results_eq(
  $$ select c.nome, p.ord::int, p.v ->> 'chiave', p.v ->> 'nome', p.v ->> 'unita',
            (p.v ->> 'n_letture')::int, p.v ->> 'valore_min', p.v ->> 'valore_max'
       from catalogo_strumenti c, jsonb_array_elements(c.parametri) with ordinality as p (v, ord)
      order by c.id, p.ord $$,
  $$ values ('SPAD'::text, 1, 'spad'::text, 'SPAD'::text, null::text, 1, null::text, null::text),
            ('Termometro', 1, 'temp_aria', 'Temp aria', '°C', 1, null, null),
            ('Termometro', 2, 'temp_pianta', 'Temp pianta', '°C', 1, null, null),
            ('Ciras', 1, 'a', 'A', 'µmol m⁻² s⁻¹', 1, null, null),
            ('Ciras', 2, 'gs', 'gs', 'mol m⁻² s⁻¹', 1, null, null),
            ('Ciras', 3, 'e', 'E', 'mmol m⁻² s⁻¹', 1, null, null),
            ('Ciras', 4, 'ci', 'Ci', 'µmol mol⁻¹', 1, null, null),
            ('Metro', 1, 'altezza', 'Altezza', 'cm', 1, null, null),
            ('Calibro', 1, 'diametro', 'Diametro', 'mm', 1, null, null) $$,
  'i valori dei semi hanno chiavi, nomi e unita'' del piano, una lettura e nessun limite');

select is(
  array[
    (select count(*)::int from catalogo_strumenti c, jsonb_array_elements(c.parametri) p (v)
      where not p.v ?& array['chiave', 'nome', 'unita', 'n_letture', 'valore_min', 'valore_max']),
    (select count(*)::int from catalogo_strumenti c, jsonb_array_elements(c.parametri) p (v)
      where jsonb_typeof(p.v -> 'unita') = 'null'),
    (select count(*)::int from catalogo_strumenti c, jsonb_array_elements(c.parametri) p (v)
      where jsonb_typeof(p.v -> 'valore_min') <> 'null' or jsonb_typeof(p.v -> 'valore_max') <> 'null')],
  array[0, 1, 0],
  'ogni valore dei semi ha tutte le chiavi; solo SPAD ha l''unita'' null (JSON null); nessun limite');

-- Fixture (superuser): due utenti invitati, A e B.
insert into inviti (email, codice) values ('a.catalogo@test.it', 'CODICEA2'), ('b.catalogo@test.it', 'CODICEB2');
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('09000000-0000-0000-0000-00000000000a', 'a.catalogo@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'CODICEA2')),
  ('09000000-0000-0000-0000-00000000000b', 'b.catalogo@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'CODICEB2'));

-- ===== A aggiunge una voce =====
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ insert into catalogo_strumenti (id, nome, icona, parametri)
     values ('c9000000-0000-0000-0000-000000000001', 'Porometro', '💧',
             '[{"chiave": "gs", "nome": "gs", "unita": "mmol m⁻² s⁻¹", "n_letture": 1, "valore_min": null, "valore_max": null}]') $$,
  'A inserisce una voce nel catalogo');

select is(
  (select creato_da from catalogo_strumenti where id = 'c9000000-0000-0000-0000-000000000001'),
  '09000000-0000-0000-0000-00000000000a'::uuid,
  'creato_da prende l''utente che inserisce');

select throws_ok(
  $$ insert into catalogo_strumenti (nome, creato_da)
     values ('A nome di B', '09000000-0000-0000-0000-00000000000b') $$,
  '42501', null,
  'nessuno inserisce una voce a nome di un altro utente');

select throws_ok(
  $$ insert into catalogo_strumenti (nome) values (' spad ') $$,
  '23505', null,
  'nome doppio tra le voci non archiviate (senza badare a spazi e maiuscole): rifiutato');

select throws_ok(
  $$ insert into catalogo_strumenti (nome) values ('   ') $$,
  '23514', null,
  'una voce senza nome: rifiutata');

select throws_ok(
  $$ insert into catalogo_strumenti (nome, parametri) values ('Oggetto', '{"chiave": "a"}') $$,
  '23514', null,
  'parametri che non sono un array JSON: rifiutati');

-- ===== B vede e modifica la voce di A =====
select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::int from catalogo_strumenti),
  6,
  'B vede i 5 semi e la voce di A');

select isnt_empty(
  $$ update catalogo_strumenti set descrizione = 'Conduttanza stomatica'
      where id = 'c9000000-0000-0000-0000-000000000001' returning id $$,
  'B modifica la voce di A');

-- L'upsert come lo fa PostgREST (tutte le colonne del payload nel SET, mai creato_da).
select lives_ok(
  $$ insert into catalogo_strumenti (id, nome, icona, descrizione, parametri, archiviato)
     values ('c9000000-0000-0000-0000-000000000001', 'Porometro', '💧', 'Conduttanza stomatica, foglia apicale',
             '[]', false)
     on conflict (id) do update set
       id = excluded.id, nome = excluded.nome, icona = excluded.icona, descrizione = excluded.descrizione,
       parametri = excluded.parametri, archiviato = excluded.archiviato $$,
  'B aggiorna la voce di A con un upsert per id');

select throws_ok(
  $$ update catalogo_strumenti set id = 'c9000000-0000-0000-0000-0000000000ff'
      where id = 'c9000000-0000-0000-0000-000000000001' $$,
  'P0001', 'ID_NON_MODIFICABILE',
  'l''id di una voce non cambia');

select throws_ok(
  $$ insert into catalogo_strumenti (id, nome) values ('c0000000-0000-0000-0000-000000000003', 'Ciras')
     on conflict (id) do update set id = 'c9000000-0000-0000-0000-0000000000fe', nome = excluded.nome $$,
  'P0001', 'ID_NON_MODIFICABILE',
  'nemmeno un upsert cambia l''id di una voce');

select results_eq(
  $$ select descrizione, parametri, creato_da from catalogo_strumenti
      where id = 'c9000000-0000-0000-0000-000000000001' $$,
  $$ values ('Conduttanza stomatica, foglia apicale'::text, '[]'::jsonb, '09000000-0000-0000-0000-00000000000a'::uuid) $$,
  'la modifica di B e'' salvata e la voce resta firmata da A');

select isnt_empty(
  $$ update catalogo_strumenti set parametri = '[{"chiave": "spad", "nome": "SPAD", "unita": null, "n_letture": 3,
                                                  "valore_min": 0, "valore_max": 99}]'
      where id = 'c0000000-0000-0000-0000-000000000001' returning id $$,
  'B modifica anche un seme (il catalogo e'' condiviso)');

select throws_ok(
  $$ update catalogo_strumenti set creato_da = '09000000-0000-0000-0000-00000000000b'
      where id = 'c9000000-0000-0000-0000-000000000001' $$,
  '42501', null,
  'creato_da non si aggiorna');

select throws_ok(
  $$ delete from catalogo_strumenti where id = 'c9000000-0000-0000-0000-000000000001' $$,
  '42501', null,
  'authenticated non elimina voci del catalogo (si archiviano)');

select throws_ok(
  $$ update catalogo_strumenti set nome = 'Termometro' where id = 'c9000000-0000-0000-0000-000000000001' $$,
  '23505', null,
  'rinominare una voce con il nome di un''altra non archiviata: rifiutato');

-- Una voce archiviata libera il suo nome.
select isnt_empty(
  $$ update catalogo_strumenti set archiviato = true where id = 'c0000000-0000-0000-0000-000000000005' returning id $$,
  'B archivia una voce');
select lives_ok(
  $$ insert into catalogo_strumenti (id, nome) values ('c9000000-0000-0000-0000-000000000002', 'Calibro') $$,
  'il nome di una voce archiviata si puo'' riusare');

-- ===== Le copie negli esperimenti restano dei loro membri =====
-- B crea un esperimento con uno strumento copiato dal catalogo: crea_esperimento salva i collegamenti.
select is(
  crea_esperimento('{
    "esperimento": {"id": "e9000000-0000-0000-0000-00000000000b", "nome": "Esperimento di B", "data_inizio": null, "note": "", "stato": "in_corso"},
    "parametri": [
      {"id": "c9b00000-0000-0000-0000-000000000001", "nome": "Temp aria", "unita": "°C", "tipo": "numero", "ordine": 0,
       "archiviato": false, "progressivo": false, "n_letture": 1, "valore_min": null, "valore_max": null,
       "sotto_campi": [], "catalogo_chiave": "temp_aria"},
      {"id": "c9b00000-0000-0000-0000-000000000002", "nome": "Note", "unita": null, "tipo": "testo", "ordine": 1,
       "archiviato": false, "progressivo": false, "n_letture": 1, "valore_min": null, "valore_max": null,
       "sotto_campi": []}],
    "strumenti": [
      {"id": "d9b00000-0000-0000-0000-000000000001", "nome": "Termometro", "icona": "🌡", "ordine": 0,
       "tipo": "strumento", "archiviato": false, "catalogo_id": "c0000000-0000-0000-0000-000000000002",
       "parametri": [{"parametro_id": "c9b00000-0000-0000-0000-000000000001", "obbligatorio": false, "ordine": 0}]},
      {"id": "d9b00000-0000-0000-0000-000000000002", "nome": "Tabella fenologica", "icona": null, "ordine": 1,
       "tipo": "fenologico", "archiviato": false,
       "parametri": [{"parametro_id": "c9b00000-0000-0000-0000-000000000002", "obbligatorio": false, "ordine": 0}]}]
  }'::jsonb),
  'e9000000-0000-0000-0000-00000000000b'::uuid,
  'crea_esperimento con catalogo_id e catalogo_chiave nella bozza');

select results_eq(
  $$ select id, catalogo_id from strumenti where esperimento_id = 'e9000000-0000-0000-0000-00000000000b' order by ordine $$,
  $$ values ('d9b00000-0000-0000-0000-000000000001'::uuid, 'c0000000-0000-0000-0000-000000000002'::uuid),
            ('d9b00000-0000-0000-0000-000000000002', null) $$,
  'crea_esperimento salva catalogo_id (null se la bozza non lo porta)');

select results_eq(
  $$ select id, catalogo_chiave from parametri where esperimento_id = 'e9000000-0000-0000-0000-00000000000b' order by ordine $$,
  $$ values ('c9b00000-0000-0000-0000-000000000001'::uuid, 'temp_aria'::text),
            ('c9b00000-0000-0000-0000-000000000002', null) $$,
  'crea_esperimento salva catalogo_chiave (null se la bozza non lo porta)');

select throws_ok(
  $$ update strumenti set catalogo_id = 'c9999999-0000-0000-0000-000000000000'
      where id = 'd9b00000-0000-0000-0000-000000000001' $$,
  '23503', null,
  'catalogo_id deve essere una voce del catalogo');

-- A vede il catalogo ma non le copie di B: un aggiornamento dal catalogo non arriva agli esperimenti altrui.
select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);

select is_empty(
  $$ select id from strumenti where catalogo_id = 'c0000000-0000-0000-0000-000000000002' $$,
  'A non vede gli strumenti di B copiati dal catalogo');

select is_empty(
  $$ update parametri set unita = 'K' where catalogo_chiave = 'temp_aria' returning id $$,
  'A non modifica i parametri di B copiati dal catalogo');

-- ===== anon non vede nulla =====
reset role;
set local role anon;
select throws_ok(
  $$ select count(*) from catalogo_strumenti $$,
  '42501', null,
  'anon non legge il catalogo');
select throws_ok(
  $$ insert into catalogo_strumenti (nome) values ('Anonimo') $$,
  '42501', null,
  'anon non scrive nel catalogo');

-- ===== aggiornato_il =====
reset role;
-- ===== Una voce sopravvive al suo autore =====
delete from auth.users where id = '09000000-0000-0000-0000-00000000000a';
select results_eq(
  $$ select nome, creato_da from catalogo_strumenti where id = 'c9000000-0000-0000-0000-000000000001' $$,
  $$ values ('Porometro'::text, null::uuid) $$,
  'eliminando l''autore la voce resta, senza autore');
select is(
  (select count(*)::int from catalogo_strumenti),
  7,
  'il catalogo non perde voci quando un utente viene eliminato');

update catalogo_strumenti set aggiornato_il = '2000-01-01' where id = 'c0000000-0000-0000-0000-000000000004';
select is(
  (select aggiornato_il from catalogo_strumenti where id = 'c0000000-0000-0000-0000-000000000004'),
  now(),
  'il trigger mette aggiornato_il all''ora della modifica');

select * from finish();
rollback;
