begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Fixture (superuser): A e B, un esperimento ciascuno, due foto di A (una da archiviare, una no).
insert into inviti (email, codice) values ('a.arch@test.it', 'CODICEAR1'), ('b.arch@test.it', 'CODICEAR2');
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('0e700000-0000-0000-0000-00000000000a', 'a.arch@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'CODICEAR1')),
  ('0e700000-0000-0000-0000-00000000000b', 'b.arch@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'CODICEAR2'));

insert into esperimenti (id, nome, creato_da) values
  ('e7000000-0000-0000-0000-000000000001', 'EA', '0e700000-0000-0000-0000-00000000000a'),
  ('e7000000-0000-0000-0000-000000000002', 'EB', '0e700000-0000-0000-0000-00000000000b');

insert into foto (id, esperimento_id, data, percorso, creato_da) values
  ('f7000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000001', '2026-10-01',
   'e7000000-0000-0000-0000-000000000001/f7000000-0000-0000-0000-000000000001.jpg', '0e700000-0000-0000-0000-00000000000a'),
  ('f7000000-0000-0000-0000-000000000002', 'e7000000-0000-0000-0000-000000000001', '2026-10-02',
   'e7000000-0000-0000-0000-000000000001/f7000000-0000-0000-0000-000000000002.jpg', '0e700000-0000-0000-0000-00000000000a');

select col_is_null('public', 'foto', 'archiviata_il', 'archiviata_il e'' nullable (le foto con il file non hanno data)');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '0e700000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ update foto set archiviata = true, archiviata_il = '2026-11-01 10:00:00+00'
      where id = 'f7000000-0000-0000-0000-000000000001' $$,
  'A archivia una foto scrivendo archiviata e archiviata_il insieme');

select results_eq(
  $$ select archiviata, archiviata_il from foto where id = 'f7000000-0000-0000-0000-000000000001' $$,
  $$ values (true, '2026-11-01 10:00:00+00'::timestamptz) $$,
  'la foto risulta archiviata con la sua data');

select throws_ok(
  $$ update foto set archiviata = true where id = 'f7000000-0000-0000-0000-000000000002' $$,
  '23514', null,
  'archiviata senza archiviata_il si rifiuta');

select throws_ok(
  $$ update foto set archiviata_il = now() where id = 'f7000000-0000-0000-0000-000000000002' $$,
  '23514', null,
  'archiviata_il senza archiviata si rifiuta');

select throws_ok(
  $$ update foto set archiviata = false where id = 'f7000000-0000-0000-0000-000000000001' $$,
  '23514', null,
  'togliere archiviata lasciando la data si rifiuta');

select is(
  (select count(*)::int from foto where archiviata <> (archiviata_il is not null)),
  0,
  'le due colonne non sono mai discordi');

-- B non e' membro di EA: l'update non tocca nessuna riga (la RLS la nasconde) e la data non cambia.
select set_config('request.jwt.claims',
  json_build_object('sub', '0e700000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);
select is_empty(
  $$ update foto set archiviata = true, archiviata_il = now()
      where id = 'f7000000-0000-0000-0000-000000000002' returning id $$,
  'B non archivia le foto di A');

reset role;
select * from finish();
rollback;
