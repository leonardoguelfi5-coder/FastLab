begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- Fixture (superuser): inviti per un utente normale, un admin e un invitato scritto con
-- le maiuscole; poi l'utente normale e l'admin si registrano.
insert into inviti (email) values
  ('utente@test.it'),
  ('admin@test.it'),
  ('Invitato@Test.it');

insert into auth.users (id, email, aud, role, instance_id) values
  ('91000000-0000-0000-0000-000000000001', 'utente@test.it', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('92000000-0000-0000-0000-000000000001', 'admin@test.it', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

update profili set admin = true where id = '92000000-0000-0000-0000-000000000001';

-- Registrazione solo su invito
select throws_ok(
  $$ insert into auth.users (id, email, aud, role, instance_id)
     values ('90000000-0000-0000-0000-000000000001', 'sconosciuto@test.it', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000') $$,
  'P0001', 'INVITO_MANCANTE',
  'senza invito non ci si registra');

select throws_ok(
  $$ insert into auth.users (id, phone, aud, role, instance_id)
     values ('90000000-0000-0000-0000-000000000004', '393330000000', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000') $$,
  'P0001', 'INVITO_MANCANTE',
  'senza email (es. telefono) non ci si registra');

select lives_ok(
  $$ insert into auth.users (id, email, aud, role, instance_id)
     values ('90000000-0000-0000-0000-000000000002', 'invitato@test.it', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000') $$,
  'con un invito ci si registra (email senza badare alle maiuscole)');

select ok(
  exists (select 1 from profili
           where id = '90000000-0000-0000-0000-000000000002' and email = 'invitato@test.it' and not admin),
  'la registrazione crea il profilo, non admin');

select isnt(
  (select usato_il from inviti where lower(email) = 'invitato@test.it'),
  null,
  'l''invito risulta usato');

select throws_ok(
  $$ insert into auth.users (id, email, aud, role, instance_id)
     values ('90000000-0000-0000-0000-000000000003', 'invitato@test.it', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000') $$,
  'P0001', 'INVITO_MANCANTE',
  'un invito gia'' usato non vale una seconda volta');

-- Utente non admin
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '91000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

select is((select count(*)::int from inviti), 0, 'un utente non admin non vede gli inviti');

select throws_ok(
  $$ insert into inviti (email) values ('altro@test.it') $$,
  '42501', null,
  'un utente non admin non crea inviti');

select is(is_admin(), false, 'is_admin() e'' falso per un utente normale');

select results_eq(
  $$ select id from profili $$,
  $$ values ('91000000-0000-0000-0000-000000000001'::uuid) $$,
  'ognuno vede solo il proprio profilo');

select throws_ok(
  $$ update profili set admin = true where id = '91000000-0000-0000-0000-000000000001' $$,
  '42501', null,
  'un utente non si fa admin da solo');

select throws_ok(
  $$ insert into profili (id, email, admin) values ('90000000-0000-0000-0000-000000000005', 'x@test.it', true) $$,
  '42501', null,
  'un utente non crea profili');

-- Admin
select set_config('request.jwt.claims',
  json_build_object('sub', '92000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

select is(is_admin(), true, 'is_admin() e'' vero per l''admin');

select lives_ok(
  $$ insert into inviti (email) values ('nuovo@test.it') $$,
  'l''admin crea un invito');

select throws_ok(
  $$ insert into inviti (email) values ('NUOVO@test.it') $$,
  '23505', null,
  'un''email si invita una volta sola, senza badare alle maiuscole');

select is((select count(*)::int from inviti), 4, 'l''admin vede tutti gli inviti');

-- anon: nessun accesso
reset role;
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

select throws_ok(
  $$ select count(*) from inviti $$,
  '42501', null,
  'anon non legge gli inviti');

select throws_ok(
  $$ select count(*) from profili $$,
  '42501', null,
  'anon non legge i profili');

reset role;
select * from finish();
rollback;
