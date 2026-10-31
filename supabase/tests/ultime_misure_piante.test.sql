begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- ===== ultime_misure_piante: tutte le misure della data piu' recente di ogni coppia (pianta, strumento), sotto RLS =====
select has_function('public', 'ultime_misure_piante', array['uuid'],
  'ultime_misure_piante(uuid) esiste');
select ok(not has_function_privilege('anon', 'public.ultime_misure_piante(uuid)', 'execute'),
  'anon non esegue ultime_misure_piante');
select ok(has_function_privilege('authenticated', 'public.ultime_misure_piante(uuid)', 'execute'),
  'authenticated esegue ultime_misure_piante');

-- Fixture (superuser): due utenti invitati, A e B.
insert into inviti (email, codice) values ('a.ultpi@test.it', 'CODICEA3'), ('b.ultpi@test.it', 'CODICEB3');
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('0a100000-0000-0000-0000-000000000001', 'a.ultpi@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'CODICEA3')),
  ('0b100000-0000-0000-0000-000000000001', 'b.ultpi@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'CODICEB3'));

-- Un esperimento di A con due piante e due strumenti; un secondo esperimento di A che non deve comparire nel primo.
insert into esperimenti (id, nome, creato_da) values
  ('e0b00000-0000-0000-0000-000000000001', 'Ultime piante 1', '0a100000-0000-0000-0000-000000000001'),
  ('e0b00000-0000-0000-0000-000000000002', 'Ultime piante 2', '0a100000-0000-0000-0000-000000000001');
insert into trattamenti (id, esperimento_id, etichetta, ordine) values
  ('70b00000-0000-0000-0000-000000000001', 'e0b00000-0000-0000-0000-000000000001', 'T1', 0),
  ('70b00000-0000-0000-0000-000000000002', 'e0b00000-0000-0000-0000-000000000002', 'T1', 0);
insert into piante (id, esperimento_id, trattamento_id, etichetta, ordine) values
  ('b0b00000-0000-0000-0000-000000000001', 'e0b00000-0000-0000-0000-000000000001', '70b00000-0000-0000-0000-000000000001', '1', 0),
  ('b0b00000-0000-0000-0000-000000000002', 'e0b00000-0000-0000-0000-000000000001', '70b00000-0000-0000-0000-000000000001', '2', 1),
  ('b0b00000-0000-0000-0000-000000000003', 'e0b00000-0000-0000-0000-000000000002', '70b00000-0000-0000-0000-000000000002', '1', 0);
insert into strumenti (id, esperimento_id, nome, ordine) values
  ('d0b00000-0000-0000-0000-000000000001', 'e0b00000-0000-0000-0000-000000000001', 'SPAD', 0),
  ('d0b00000-0000-0000-0000-000000000002', 'e0b00000-0000-0000-0000-000000000001', 'Ciras', 1),
  ('d0b00000-0000-0000-0000-000000000003', 'e0b00000-0000-0000-0000-000000000002', 'SPAD', 0);
-- Pianta 1 / SPAD: 14/10 e due misure il 21/10 (entrambe devono tornare); pianta 1 / Ciras: 7/10 e 9/10 (solo il 9/10);
-- pianta 2 / SPAD: solo il 14/10 (torna, anche se un'altra pianta e' stata misurata dopo); pianta 2 / Ciras: mai misurata.
-- Esperimento 2: una misura che non deve comparire.
insert into misure (id, esperimento_id, pianta_id, strumento_id, data_rilievo, ora, creato_da) values
  ('a0b00000-0000-0000-0000-000000000001', 'e0b00000-0000-0000-0000-000000000001', 'b0b00000-0000-0000-0000-000000000001',
   'd0b00000-0000-0000-0000-000000000001', '2026-10-14', '09:00', '0a100000-0000-0000-0000-000000000001'),
  ('a0b00000-0000-0000-0000-000000000002', 'e0b00000-0000-0000-0000-000000000001', 'b0b00000-0000-0000-0000-000000000001',
   'd0b00000-0000-0000-0000-000000000001', '2026-10-21', '09:00', '0a100000-0000-0000-0000-000000000001'),
  ('a0b00000-0000-0000-0000-000000000003', 'e0b00000-0000-0000-0000-000000000001', 'b0b00000-0000-0000-0000-000000000001',
   'd0b00000-0000-0000-0000-000000000001', '2026-10-21', '15:00', '0a100000-0000-0000-0000-000000000001'),
  ('a0b00000-0000-0000-0000-000000000004', 'e0b00000-0000-0000-0000-000000000001', 'b0b00000-0000-0000-0000-000000000001',
   'd0b00000-0000-0000-0000-000000000002', '2026-10-07', '09:00', '0a100000-0000-0000-0000-000000000001'),
  ('a0b00000-0000-0000-0000-000000000005', 'e0b00000-0000-0000-0000-000000000001', 'b0b00000-0000-0000-0000-000000000001',
   'd0b00000-0000-0000-0000-000000000002', '2026-10-09', '10:00', '0a100000-0000-0000-0000-000000000001'),
  ('a0b00000-0000-0000-0000-000000000006', 'e0b00000-0000-0000-0000-000000000001', 'b0b00000-0000-0000-0000-000000000002',
   'd0b00000-0000-0000-0000-000000000001', '2026-10-14', '09:30', '0a100000-0000-0000-0000-000000000001'),
  ('a0b00000-0000-0000-0000-000000000007', 'e0b00000-0000-0000-0000-000000000002', 'b0b00000-0000-0000-0000-000000000003',
   'd0b00000-0000-0000-0000-000000000003', '2026-10-28', '09:00', '0a100000-0000-0000-0000-000000000001');

-- ===== A, proprietario =====
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '0a100000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select id from ultime_misure_piante('e0b00000-0000-0000-0000-000000000001') order by id $$,
  $$ values ('a0b00000-0000-0000-0000-000000000002'::uuid),
            ('a0b00000-0000-0000-0000-000000000003'),
            ('a0b00000-0000-0000-0000-000000000005'),
            ('a0b00000-0000-0000-0000-000000000006') $$,
  'solo la data piu'' recente di ogni coppia pianta/strumento, con tutte le misure di quel giorno (le due del 21/10)');

select results_eq(
  $$ select id from ultime_misure_piante('e0b00000-0000-0000-0000-000000000002') $$,
  $$ values ('a0b00000-0000-0000-0000-000000000007'::uuid) $$,
  'l''altro esperimento di A ha le sue misure e non mescola quelle del primo');

-- ===== B, non membro: nessuna riga =====
select set_config('request.jwt.claims',
  json_build_object('sub', '0b100000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

select is_empty(
  $$ select * from ultime_misure_piante('e0b00000-0000-0000-0000-000000000001') $$,
  'B non vede nessuna misura dell''esperimento di A');

-- ===== anon: non la esegue =====
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

select throws_ok(
  $$ select * from ultime_misure_piante('e0b00000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'anon non chiama ultime_misure_piante');

reset role;
select * from finish();
rollback;
