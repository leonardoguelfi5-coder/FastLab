begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

-- ===== Le funzioni e i loro privilegi =====
select has_function('public', 'conteggi_strumenti', array['uuid'], 'conteggi_strumenti(uuid) esiste');
select ok(not has_function_privilege('anon', 'public.conteggi_strumenti(uuid)', 'execute'),
  'anon non esegue conteggi_strumenti');
select ok(has_function_privilege('authenticated', 'public.conteggi_strumenti(uuid)', 'execute'),
  'authenticated esegue conteggi_strumenti');
select isnt_definer('public', 'conteggi_strumenti', array['uuid'],
  'conteggi_strumenti e'' security invoker: la RLS delle misure decide che cosa conta');

select has_function('public', 'spazio_progetto', array['uuid'], 'spazio_progetto(uuid) esiste');
select is_definer('public', 'spazio_progetto', array['uuid'],
  'spazio_progetto e'' security definer: somma anche le foto degli esperimenti di altri');
select volatility_is('public', 'spazio_progetto', array['uuid'], 'stable', 'spazio_progetto e'' stable');
select ok(not has_function_privilege('anon', 'public.spazio_progetto(uuid)', 'execute'),
  'anon non esegue spazio_progetto');
select ok(not has_function_privilege('public', 'public.spazio_progetto(uuid)', 'execute'),
  'public non esegue spazio_progetto');
select ok(has_function_privilege('authenticated', 'public.spazio_progetto(uuid)', 'execute'),
  'authenticated esegue spazio_progetto');

-- Fixture (superuser): A con l'esperimento E1, B con l'esperimento E2.
insert into inviti (email, codice) values ('a.spazio@test.it', 'CODICESP1'), ('b.spazio@test.it', 'CODICESP2');
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('0c150000-0000-0000-0000-00000000000a', 'a.spazio@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'CODICESP1')),
  ('0c150000-0000-0000-0000-00000000000b', 'b.spazio@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'CODICESP2'));

insert into esperimenti (id, nome, creato_da) values
  ('e1500000-0000-0000-0000-000000000001', 'Spazio A', '0c150000-0000-0000-0000-00000000000a'),
  ('e1500000-0000-0000-0000-000000000002', 'Spazio B', '0c150000-0000-0000-0000-00000000000b');
insert into trattamenti (id, esperimento_id, etichetta, ordine) values
  ('71500000-0000-0000-0000-000000000001', 'e1500000-0000-0000-0000-000000000001', 'T1', 0),
  ('71500000-0000-0000-0000-000000000002', 'e1500000-0000-0000-0000-000000000002', 'T1', 0);
insert into piante (id, esperimento_id, trattamento_id, etichetta, ordine) values
  ('b1500000-0000-0000-0000-000000000001', 'e1500000-0000-0000-0000-000000000001', '71500000-0000-0000-0000-000000000001', '1', 0),
  ('b1500000-0000-0000-0000-000000000002', 'e1500000-0000-0000-0000-000000000001', '71500000-0000-0000-0000-000000000001', '2', 1),
  ('b1500000-0000-0000-0000-000000000003', 'e1500000-0000-0000-0000-000000000002', '71500000-0000-0000-0000-000000000002', '1', 0);
-- E1: SPAD con piu' misure su due piante, Ciras con una, Termometro mai misurato; E2: uno strumento misurato.
insert into strumenti (id, esperimento_id, nome, ordine) values
  ('d1500000-0000-0000-0000-000000000001', 'e1500000-0000-0000-0000-000000000001', 'SPAD', 0),
  ('d1500000-0000-0000-0000-000000000002', 'e1500000-0000-0000-0000-000000000001', 'Ciras', 1),
  ('d1500000-0000-0000-0000-000000000003', 'e1500000-0000-0000-0000-000000000001', 'Termometro', 2),
  ('d1500000-0000-0000-0000-000000000004', 'e1500000-0000-0000-0000-000000000002', 'SPAD', 0);
-- Parametri di E1: c1 numero con dati, c2 senza dati, c3 lista con dati, c4 archiviato con dati, c5 che compare
-- solo come elemento di un valori che non e' un oggetto (l'operatore `?` di prima lo contava). c6 e' di E2, ma la
-- sua chiave compare anche in una misura di E1: non e' di E1 e non va restituito per E1.
insert into parametri (id, esperimento_id, nome, tipo, ordine, archiviato) values
  ('c1500000-0000-0000-0000-000000000001', 'e1500000-0000-0000-0000-000000000001', 'SPAD', 'numero', 0, false),
  ('c1500000-0000-0000-0000-000000000002', 'e1500000-0000-0000-0000-000000000001', 'Temp', 'numero', 1, false),
  ('c1500000-0000-0000-0000-000000000003', 'e1500000-0000-0000-0000-000000000001', 'Palchi', 'lista', 2, false),
  ('c1500000-0000-0000-0000-000000000004', 'e1500000-0000-0000-0000-000000000001', 'Vecchio', 'numero', 3, true),
  ('c1500000-0000-0000-0000-000000000005', 'e1500000-0000-0000-0000-000000000001', 'Strano', 'testo', 4, false),
  ('c1500000-0000-0000-0000-000000000006', 'e1500000-0000-0000-0000-000000000002', 'SPAD', 'numero', 0, false);
insert into misure (id, esperimento_id, pianta_id, strumento_id, data_rilievo, ora, valori, creato_da) values
  ('a1500000-0000-0000-0000-000000000001', 'e1500000-0000-0000-0000-000000000001', 'b1500000-0000-0000-0000-000000000001',
   'd1500000-0000-0000-0000-000000000001', '2026-10-14', '09:00',
   '{"c1500000-0000-0000-0000-000000000001": 41.2, "chiave-estranea": 1}', '0c150000-0000-0000-0000-00000000000a'),
  ('a1500000-0000-0000-0000-000000000002', 'e1500000-0000-0000-0000-000000000001', 'b1500000-0000-0000-0000-000000000001',
   'd1500000-0000-0000-0000-000000000001', '2026-10-21', '09:00',
   '{"c1500000-0000-0000-0000-000000000003": [{"n": 1}], "c1500000-0000-0000-0000-000000000006": 3}',
   '0c150000-0000-0000-0000-00000000000a'),
  ('a1500000-0000-0000-0000-000000000003', 'e1500000-0000-0000-0000-000000000001', 'b1500000-0000-0000-0000-000000000002',
   'd1500000-0000-0000-0000-000000000001', '2026-11-03', '15:00',
   '{"c1500000-0000-0000-0000-000000000004": 7}', '0c150000-0000-0000-0000-00000000000a'),
  ('a1500000-0000-0000-0000-000000000004', 'e1500000-0000-0000-0000-000000000001', 'b1500000-0000-0000-0000-000000000002',
   'd1500000-0000-0000-0000-000000000002', '2026-10-07', '09:00',
   '["c1500000-0000-0000-0000-000000000005", 12]', '0c150000-0000-0000-0000-00000000000a'),
  ('a1500000-0000-0000-0000-000000000005', 'e1500000-0000-0000-0000-000000000002', 'b1500000-0000-0000-0000-000000000003',
   'd1500000-0000-0000-0000-000000000004', '2026-10-28', '09:00',
   '{"c1500000-0000-0000-0000-000000000006": 30}', '0c150000-0000-0000-0000-00000000000b');

insert into note (id, esperimento_id, data, testo, creato_da) values
  ('9e150000-0000-0000-0000-000000000001', 'e1500000-0000-0000-0000-000000000001', '2026-10-14', 'Irrigazione', '0c150000-0000-0000-0000-00000000000a'),
  ('9e150000-0000-0000-0000-000000000002', 'e1500000-0000-0000-0000-000000000001', '2026-10-15', 'Concimazione', '0c150000-0000-0000-0000-00000000000a'),
  ('9e150000-0000-0000-0000-000000000003', 'e1500000-0000-0000-0000-000000000002', '2026-10-15', 'Di B', '0c150000-0000-0000-0000-00000000000b');

-- Foto di E1: due con il file e una archiviata (il file non c'e' piu'); una di E2.
insert into foto (id, esperimento_id, data, percorso, byte, archiviata, archiviata_il, creato_da) values
  ('f1500000-0000-0000-0000-000000000001', 'e1500000-0000-0000-0000-000000000001', '2026-10-14',
   'e1500000-0000-0000-0000-000000000001/f1500000-0000-0000-0000-000000000001.jpg', 300000, false, null, '0c150000-0000-0000-0000-00000000000a'),
  ('f1500000-0000-0000-0000-000000000002', 'e1500000-0000-0000-0000-000000000001', '2026-10-15',
   'e1500000-0000-0000-0000-000000000001/f1500000-0000-0000-0000-000000000002.jpg', 200000, false, null, '0c150000-0000-0000-0000-00000000000a'),
  ('f1500000-0000-0000-0000-000000000003', 'e1500000-0000-0000-0000-000000000001', '2026-10-01',
   'e1500000-0000-0000-0000-000000000001/f1500000-0000-0000-0000-000000000003.jpg', 999000, true, now(), '0c150000-0000-0000-0000-00000000000a'),
  ('f1500000-0000-0000-0000-000000000004', 'e1500000-0000-0000-0000-000000000002', '2026-10-15',
   'e1500000-0000-0000-0000-000000000002/f1500000-0000-0000-0000-000000000004.jpg', 400000, false, null, '0c150000-0000-0000-0000-00000000000b');

-- Gli oggetti dello Storage: i file delle tre foto con il file, un file in piu' nella cartella di E2 (un orfano conta
-- lo stesso: occupa spazio) e un file di un altro bucket, che non conta.
insert into storage.buckets (id, name, public) values ('altro', 'altro', false);
insert into storage.objects (bucket_id, name, metadata) values
  ('foto', 'e1500000-0000-0000-0000-000000000001/f1500000-0000-0000-0000-000000000001.jpg', '{"size": 350000, "mimetype": "image/jpeg"}'),
  ('foto', 'e1500000-0000-0000-0000-000000000001/f1500000-0000-0000-0000-000000000002.jpg', '{"size": 250000, "mimetype": "image/jpeg"}'),
  ('foto', 'e1500000-0000-0000-0000-000000000002/f1500000-0000-0000-0000-000000000004.jpg', '{"size": 450000, "mimetype": "image/jpeg"}'),
  ('foto', 'e1500000-0000-0000-0000-000000000002/f1500000-0000-0000-0000-000000000009.jpg', '{"size": 50000, "mimetype": "image/jpeg"}'),
  ('altro', 'qualcosa/grande.bin', '{"size": 9000000}');

-- Da superuser (nessuna RLS): parametri_con_dati da' lo stesso insieme della versione della 20261028000004, un
-- exists con l'operatore `?` per ogni parametro.
select set_eq(
  $$ select * from parametri_con_dati('e1500000-0000-0000-0000-000000000001') $$,
  $$ select p.id from parametri p
      where p.esperimento_id = 'e1500000-0000-0000-0000-000000000001'
        and exists (select 1 from misure m where m.esperimento_id = p.esperimento_id and m.valori ? p.id::text) $$,
  'parametri_con_dati da'' lo stesso insieme della versione di prima');

-- ===== A, membro di E1 =====
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '0c150000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select strumento_id, misure, piante, prima, ultima from conteggi_strumenti('e1500000-0000-0000-0000-000000000001')
      order by strumento_id $$,
  $$ values ('d1500000-0000-0000-0000-000000000001'::uuid, 3::bigint, 2::bigint, '2026-10-14'::date, '2026-11-03'::date),
            ('d1500000-0000-0000-0000-000000000002', 1, 1, '2026-10-07', '2026-10-07') $$,
  'conteggi_strumenti: misure, piante distinte, prima e ultima data per ogni strumento misurato di E1');

select is_empty(
  $$ select * from conteggi_strumenti('e1500000-0000-0000-0000-000000000001')
      where strumento_id = 'd1500000-0000-0000-0000-000000000003' $$,
  'conteggi_strumenti: lo strumento senza misure non c''e''');

select is_empty(
  $$ select * from conteggi_strumenti('e1500000-0000-0000-0000-000000000002') $$,
  'conteggi_strumenti: A non vede nulla dell''esperimento di B (RLS)');

select set_eq(
  $$ select * from parametri_con_dati('e1500000-0000-0000-0000-000000000001') $$,
  $$ values ('c1500000-0000-0000-0000-000000000001'::uuid), ('c1500000-0000-0000-0000-000000000003'),
            ('c1500000-0000-0000-0000-000000000004'), ('c1500000-0000-0000-0000-000000000005') $$,
  'parametri_con_dati: con dati (anche lista, archiviato e dentro un valori non oggetto), senza c2 ne'' il parametro di E2');

select is_empty(
  $$ select * from parametri_con_dati('e1500000-0000-0000-0000-000000000002') $$,
  'parametri_con_dati: A non vede nulla dell''esperimento di B (RLS)');

select ok((spazio_progetto('e1500000-0000-0000-0000-000000000001') ->> 'database_byte')::bigint > 0,
  'spazio_progetto: database_byte e'' la dimensione del database, sopra zero');

select is((spazio_progetto('e1500000-0000-0000-0000-000000000001') ->> 'foto_byte')::bigint, 1100000::bigint,
  'spazio_progetto: foto_byte somma gli oggetti del bucket foto di E1 e di E2 (anche di B), senza l''altro bucket');

select set_eq(
  $$ select jsonb_object_keys(spazio_progetto('e1500000-0000-0000-0000-000000000001')) $$,
  $$ values ('database_byte'), ('foto_byte'), ('esperimento') $$,
  'spazio_progetto: solo i tre campi previsti');

select is(
  (spazio_progetto('e1500000-0000-0000-0000-000000000001') -> 'esperimento') - 'dati_byte',
  '{"misure": 4, "note": 2, "foto": 2, "foto_byte": 600000}'::jsonb,
  'spazio_progetto: per un membro i conteggi del suo esperimento (le foto archiviate non contano) e i byte dei suoi file');

select ok((spazio_progetto('e1500000-0000-0000-0000-000000000001') -> 'esperimento' ->> 'dati_byte')::bigint > 0,
  'spazio_progetto: dati_byte stima i byte delle righe dell''esperimento');

select is(spazio_progetto('e1500000-0000-0000-0000-000000000002') -> 'esperimento', 'null'::jsonb,
  'spazio_progetto: esperimento null per chi non e'' membro');

select is((spazio_progetto('e1500000-0000-0000-0000-000000000002') ->> 'foto_byte')::bigint, 1100000::bigint,
  'spazio_progetto: anche da un esperimento altrui il totale del progetto c''e''');

select is(spazio_progetto('e15fffff-0000-0000-0000-000000000099') -> 'esperimento', 'null'::jsonb,
  'spazio_progetto: esperimento null per un id che non esiste');

select ok(
  position('e1500000-0000-0000-0000-000000000002' in spazio_progetto('e1500000-0000-0000-0000-000000000002')::text) = 0
  and position('f1500000' in spazio_progetto('e1500000-0000-0000-0000-000000000002')::text) = 0
  and position('.jpg' in spazio_progetto('e1500000-0000-0000-0000-000000000001')::text) = 0
  and position('Spazio B' in spazio_progetto('e1500000-0000-0000-0000-000000000002')::text) = 0,
  'spazio_progetto: nessun nome di file o di esperimento nel risultato');

-- ===== B, membro solo di E2 =====
select set_config('request.jwt.claims',
  json_build_object('sub', '0c150000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);

select is_empty(
  $$ select * from conteggi_strumenti('e1500000-0000-0000-0000-000000000001') $$,
  'conteggi_strumenti: B non membro di E1 riceve zero righe (RLS)');

select results_eq(
  $$ select strumento_id, misure, piante from conteggi_strumenti('e1500000-0000-0000-0000-000000000002') $$,
  $$ values ('d1500000-0000-0000-0000-000000000004'::uuid, 1::bigint, 1::bigint) $$,
  'conteggi_strumenti: B vede il suo strumento');

select is(spazio_progetto('e1500000-0000-0000-0000-000000000001') -> 'esperimento', 'null'::jsonb,
  'spazio_progetto: B non riceve i conteggi di E1');

select is(
  (spazio_progetto('e1500000-0000-0000-0000-000000000002') -> 'esperimento') - 'dati_byte',
  '{"misure": 1, "note": 1, "foto": 1, "foto_byte": 500000}'::jsonb,
  'spazio_progetto: B riceve i conteggi di E2 (un file in piu'' nella cartella conta: occupa spazio)');

select is((spazio_progetto('e1500000-0000-0000-0000-000000000001') ->> 'foto_byte')::bigint, 1100000::bigint,
  'spazio_progetto: il totale delle foto e'' lo stesso per B');

-- ===== Ripiego: lo Storage non dice nulla (online, se la funzione non vedesse storage.objects) =====
reset role;
delete from storage.objects where bucket_id = 'foto';
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '0c150000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);

select is((spazio_progetto('e1500000-0000-0000-0000-000000000001') ->> 'foto_byte')::bigint, 900000::bigint,
  'spazio_progetto: senza oggetti nello Storage foto_byte si somma da public.foto (non archiviate, tutti gli esperimenti)');

select is((spazio_progetto('e1500000-0000-0000-0000-000000000001') -> 'esperimento' ->> 'foto_byte')::bigint, 500000::bigint,
  'spazio_progetto: lo stesso ripiego per le foto dell''esperimento');

-- ===== Senza sessione: nessun numero =====
select set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
select is(spazio_progetto('e1500000-0000-0000-0000-000000000001'), null::jsonb,
  'spazio_progetto: senza auth.uid() restituisce null');

-- ===== anon: non le esegue =====
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

select throws_ok(
  $$ select spazio_progetto('e1500000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'anon non chiama spazio_progetto');

select throws_ok(
  $$ select * from conteggi_strumenti('e1500000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'anon non chiama conteggi_strumenti');

reset role;
select * from finish();
rollback;
