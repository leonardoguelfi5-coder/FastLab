begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- ===== ultime_misure_per_strumento: la data piu' recente per strumento, sotto RLS =====
select has_function('public', 'ultime_misure_per_strumento', array['uuid'],
  'ultime_misure_per_strumento(uuid) esiste');
select ok(not has_function_privilege('anon', 'public.ultime_misure_per_strumento(uuid)', 'execute'),
  'anon non esegue ultime_misure_per_strumento');
select ok(has_function_privilege('authenticated', 'public.ultime_misure_per_strumento(uuid)', 'execute'),
  'authenticated esegue ultime_misure_per_strumento');

-- Fixture (superuser): due utenti invitati, A e B.
insert into inviti (email, codice) values ('a.ultime@test.it', 'CODICEA2'), ('b.ultime@test.it', 'CODICEB2');
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('0a000000-0000-0000-0000-000000000001', 'a.ultime@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'CODICEA2')),
  ('0b000000-0000-0000-0000-000000000001', 'b.ultime@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'CODICEB2'));

-- Un esperimento di A con tre strumenti (SPAD con piu' date, Ciras con una, Termometro mai misurato) e una pianta;
-- un secondo esperimento di A con uno strumento misurato, che non deve comparire nel primo.
insert into esperimenti (id, nome, creato_da) values
  ('e0a00000-0000-0000-0000-000000000001', 'Ultime 1', '0a000000-0000-0000-0000-000000000001'),
  ('e0a00000-0000-0000-0000-000000000002', 'Ultime 2', '0a000000-0000-0000-0000-000000000001');
insert into trattamenti (id, esperimento_id, etichetta, ordine) values
  ('70a00000-0000-0000-0000-000000000001', 'e0a00000-0000-0000-0000-000000000001', 'T1', 0),
  ('70a00000-0000-0000-0000-000000000002', 'e0a00000-0000-0000-0000-000000000002', 'T1', 0);
insert into piante (id, esperimento_id, trattamento_id, etichetta, ordine) values
  ('b0a00000-0000-0000-0000-000000000001', 'e0a00000-0000-0000-0000-000000000001', '70a00000-0000-0000-0000-000000000001', '1', 0),
  ('b0a00000-0000-0000-0000-000000000002', 'e0a00000-0000-0000-0000-000000000002', '70a00000-0000-0000-0000-000000000002', '1', 0);
insert into strumenti (id, esperimento_id, nome, ordine) values
  ('d0a00000-0000-0000-0000-000000000001', 'e0a00000-0000-0000-0000-000000000001', 'SPAD', 0),
  ('d0a00000-0000-0000-0000-000000000002', 'e0a00000-0000-0000-0000-000000000001', 'Ciras', 1),
  ('d0a00000-0000-0000-0000-000000000003', 'e0a00000-0000-0000-0000-000000000001', 'Termometro', 2),
  ('d0a00000-0000-0000-0000-000000000004', 'e0a00000-0000-0000-0000-000000000002', 'SPAD', 0);
insert into misure (id, esperimento_id, pianta_id, strumento_id, data_rilievo, ora, creato_da) values
  ('a0a00000-0000-0000-0000-000000000001', 'e0a00000-0000-0000-0000-000000000001', 'b0a00000-0000-0000-0000-000000000001',
   'd0a00000-0000-0000-0000-000000000001', '2026-10-14', '09:00', '0a000000-0000-0000-0000-000000000001'),
  ('a0a00000-0000-0000-0000-000000000002', 'e0a00000-0000-0000-0000-000000000001', 'b0a00000-0000-0000-0000-000000000001',
   'd0a00000-0000-0000-0000-000000000001', '2026-10-21', '09:00', '0a000000-0000-0000-0000-000000000001'),
  ('a0a00000-0000-0000-0000-000000000003', 'e0a00000-0000-0000-0000-000000000001', 'b0a00000-0000-0000-0000-000000000001',
   'd0a00000-0000-0000-0000-000000000001', '2026-10-21', '15:00', '0a000000-0000-0000-0000-000000000001'),
  ('a0a00000-0000-0000-0000-000000000004', 'e0a00000-0000-0000-0000-000000000001', 'b0a00000-0000-0000-0000-000000000001',
   'd0a00000-0000-0000-0000-000000000002', '2026-10-07', '09:00', '0a000000-0000-0000-0000-000000000001'),
  ('a0a00000-0000-0000-0000-000000000005', 'e0a00000-0000-0000-0000-000000000002', 'b0a00000-0000-0000-0000-000000000002',
   'd0a00000-0000-0000-0000-000000000004', '2026-10-28', '09:00', '0a000000-0000-0000-0000-000000000001');

-- ===== A, proprietario: una riga per strumento misurato, con la data piu' recente =====
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '0a000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select strumento_id, ultima from ultime_misure_per_strumento('e0a00000-0000-0000-0000-000000000001') order by strumento_id $$,
  $$ values ('d0a00000-0000-0000-0000-000000000001'::uuid, '2026-10-21'::date),
            ('d0a00000-0000-0000-0000-000000000002', '2026-10-07') $$,
  'A vede la data piu'' recente di ogni strumento misurato: il Termometro mai misurato non c''e'', e nemmeno gli strumenti di un altro esperimento');

select results_eq(
  $$ select strumento_id, ultima from ultime_misure_per_strumento('e0a00000-0000-0000-0000-000000000002') $$,
  $$ values ('d0a00000-0000-0000-0000-000000000004'::uuid, '2026-10-28'::date) $$,
  'l''altro esperimento di A ha le sue date');

-- ===== B, non membro: nessuna riga =====
select set_config('request.jwt.claims',
  json_build_object('sub', '0b000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

select is_empty(
  $$ select * from ultime_misure_per_strumento('e0a00000-0000-0000-0000-000000000001') $$,
  'B non vede nessuna data dell''esperimento di A');

-- ===== anon: non la esegue =====
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

select throws_ok(
  $$ select * from ultime_misure_per_strumento('e0a00000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'anon non chiama ultime_misure_per_strumento');

reset role;
select * from finish();
rollback;
