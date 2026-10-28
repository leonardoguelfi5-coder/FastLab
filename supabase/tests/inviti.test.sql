begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- Fixture (superuser): inviti con codice per un utente normale, un admin, un invitato e un
-- altro invito ancora libero; poi l'utente normale e l'admin si registrano col loro codice.
insert into inviti (email, codice) values
  ('utente@test.it', 'UTENTE22'),
  ('admin@test.it', 'ADMIN222'),
  ('invitato@test.it', 'INVITO23'),
  ('altro@test.it', 'ALTRO222');

insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('91000000-0000-0000-0000-000000000001', 'utente@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'UTENTE22')),
  ('92000000-0000-0000-0000-000000000001', 'admin@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'ADMIN222'));

update profili set admin = true where id = '92000000-0000-0000-0000-000000000001';

-- Registrazione solo con email invitata e codice giusto
select throws_ok(
  $$ insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data)
     values ('90000000-0000-0000-0000-000000000001', 'sconosciuto@test.it', 'authenticated', 'authenticated',
             '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'ALTRO222')) $$,
  'P0001', 'INVITO_MANCANTE',
  'senza invito non ci si registra');

select throws_ok(
  $$ insert into auth.users (id, phone, aud, role, instance_id)
     values ('90000000-0000-0000-0000-000000000004', '393330000000', 'authenticated', 'authenticated',
             '00000000-0000-0000-0000-000000000000') $$,
  'P0001', 'INVITO_MANCANTE',
  'senza email (es. telefono) non ci si registra');

select throws_ok(
  $$ insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data)
     values ('90000000-0000-0000-0000-000000000006', 'invitato@test.it', 'authenticated', 'authenticated',
             '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'XXXX9999')) $$,
  'P0001', 'INVITO_MANCANTE',
  'email invitata ma codice sbagliato: rifiutata');

select throws_ok(
  $$ insert into auth.users (id, email, aud, role, instance_id)
     values ('90000000-0000-0000-0000-000000000007', 'invitato@test.it', 'authenticated', 'authenticated',
             '00000000-0000-0000-0000-000000000000') $$,
  'P0001', 'INVITO_MANCANTE',
  'email invitata ma senza codice: rifiutata');

select throws_ok(
  $$ insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data)
     values ('90000000-0000-0000-0000-000000000008', 'invitato@test.it', 'authenticated', 'authenticated',
             '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'ALTRO222')) $$,
  'P0001', 'INVITO_MANCANTE',
  'il codice di un altro invito non vale');

select lives_ok(
  $$ insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data)
     values ('90000000-0000-0000-0000-000000000002', 'Invitato@Test.it', 'authenticated', 'authenticated',
             '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', ' invito23 ')) $$,
  'email e codice giusti: ci si registra (senza badare a maiuscole e spazi)');

select ok(
  exists (select 1 from profili
           where id = '90000000-0000-0000-0000-000000000002' and lower(email) = 'invitato@test.it' and not admin),
  'la registrazione crea il profilo, non admin');

select isnt(
  (select usato_il from inviti where email = 'invitato@test.it'),
  null,
  'l''invito risulta usato');

select throws_ok(
  $$ insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data)
     values ('90000000-0000-0000-0000-000000000003', 'invitato@test.it', 'authenticated', 'authenticated',
             '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'INVITO23')) $$,
  'P0001', 'INVITO_MANCANTE',
  'un invito gia'' usato non vale una seconda volta');

select ok(
  (select bool_and(c ~ '^[A-HJ-NP-Z2-9]{8}$') and count(distinct c) = 1000
     from (select genera_codice_invito() as c from generate_series(1, 1000)) x),
  'genera_codice_invito: 1000 codici di 8 caratteri senza 0, O, 1, I, tutti diversi');

-- Utente non admin
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '91000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

select is((select count(*)::int from inviti), 0, 'un utente non admin non vede gli inviti');

select is_empty(
  $$ select codice from inviti $$,
  'un utente non admin non legge i codici degli inviti');

select throws_ok(
  $$ insert into inviti (email) values ('nuovo2@test.it') $$,
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

select ok(
  (select codice ~ '^[A-HJ-NP-Z2-9]{8}$' from inviti where email = 'nuovo@test.it'),
  'l''admin legge il codice generato per il nuovo invito');

select throws_ok(
  $$ insert into inviti (email) values ('nuovo@test.it') $$,
  '23505', null,
  'un''email si invita una volta sola');

select throws_ok(
  $$ insert into inviti (email) values ('NUOVO2@test.it') $$,
  '23514', null,
  'l''email dell''invito va salvata in minuscolo');

select throws_ok(
  $$ insert into inviti (email) values (' nuovo2@test.it') $$,
  '23514', null,
  'l''email dell''invito va salvata senza spazi');

select throws_ok(
  $$ insert into inviti (email, codice) values ('nuovo3@test.it', 'INVITO23') $$,
  '23505', null,
  'due inviti non hanno lo stesso codice');

select is((select count(*)::int from inviti), 5, 'l''admin vede tutti gli inviti');

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

select throws_ok(
  $$ select genera_codice_invito() $$,
  '42501', null,
  'anon non genera codici');

reset role;
select * from finish();
rollback;
