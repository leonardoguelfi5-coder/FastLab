begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- Fixture (superuser): un utente invitato con due esperimenti (ne e' membro per il trigger del
-- proprietario). Nel primo: due trattamenti, la pianta 1 con una misura e la pianta 2 senza.
insert into inviti (email, codice) values ('g.guardie@test.it', 'CODICEG2');
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('0c000000-0000-0000-0000-000000000001', 'g.guardie@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'CODICEG2'));

insert into esperimenti (id, nome, creato_da) values
  ('e3000000-0000-0000-0000-000000000001', 'Esperimento 1', '0c000000-0000-0000-0000-000000000001'),
  ('e4000000-0000-0000-0000-000000000002', 'Esperimento 2', '0c000000-0000-0000-0000-000000000001');

insert into trattamenti (id, esperimento_id, etichetta, ordine) values
  ('73000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'T1', 0),
  ('73000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000001', 'T2', 1),
  ('74000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000002', 'T1', 0);

insert into piante (id, esperimento_id, trattamento_id, etichetta, ordine) values
  ('b3000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', '1', 0),
  ('b3000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', '2', 1);

insert into parametri (id, esperimento_id, nome, tipo, ordine) values
  ('c3000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'Altezza', 'numero', 0);

insert into passate (id, esperimento_id, nome, ordine) values
  ('d3000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'Settimanale', 0);

insert into misure (id, esperimento_id, pianta_id, passata_id, data_rilievo, ora, valori, creato_da) values
  ('a3000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001',
   'b3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001',
   '2026-10-28', '10:30:00', '{"c3000000-0000-0000-0000-000000000001": [12]}',
   '0c000000-0000-0000-0000-000000000001');

-- Catalogo: ogni tabella con esperimento_id ha la guardia.
select is_empty(
  $$ select c.relname
       from pg_class c
       join pg_attribute a on a.attrelid = c.oid and a.attname = 'esperimento_id' and not a.attisdropped
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
        and not exists (
          select 1 from pg_trigger t
           where t.tgrelid = c.oid and t.tgfoid = 'public.guardia_esperimento_id()'::regprocedure
        ) $$,
  'ogni tabella con esperimento_id ha il trigger guardia_esperimento_id');

-- Il resto come utente: le guardie valgono anche per chi e' membro di entrambi gli esperimenti.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '0c000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

-- ===== Guardia piante =====
select lives_ok(
  $$ update piante set etichetta = '1b', blocco = 'B' where id = 'b3000000-0000-0000-0000-000000000001' $$,
  'una pianta con dati si rinomina');

select lives_ok(
  $$ update piante set trattamento_id = '73000000-0000-0000-0000-000000000001', etichetta = '1c'
      where id = 'b3000000-0000-0000-0000-000000000001' $$,
  'riscrivere lo stesso trattamento di una pianta con dati non e'' un cambio');

select throws_ok(
  $$ update piante set trattamento_id = '73000000-0000-0000-0000-000000000002'
      where id = 'b3000000-0000-0000-0000-000000000001' $$,
  'P0001', 'PIANTA_CON_DATI',
  'una pianta con dati non cambia trattamento');

select lives_ok(
  $$ update piante set trattamento_id = '73000000-0000-0000-0000-000000000002'
      where id = 'b3000000-0000-0000-0000-000000000002' $$,
  'una pianta senza dati cambia trattamento');

-- ===== Guardia esperimento_id =====
select throws_ok(
  $$ update piante set esperimento_id = 'e4000000-0000-0000-0000-000000000002',
                       trattamento_id = '74000000-0000-0000-0000-000000000001'
      where id = 'b3000000-0000-0000-0000-000000000002' $$,
  'P0001', 'ESPERIMENTO_NON_MODIFICABILE',
  'una pianta non passa a un altro esperimento');

select throws_ok(
  $$ update parametri set esperimento_id = 'e4000000-0000-0000-0000-000000000002'
      where id = 'c3000000-0000-0000-0000-000000000001' $$,
  'P0001', 'ESPERIMENTO_NON_MODIFICABILE',
  'un parametro non passa a un altro esperimento');

select throws_ok(
  $$ insert into parametri (id, esperimento_id, nome, tipo, ordine)
     values ('c3000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000002', 'Altezza', 'numero', 0)
     on conflict (id) do update set esperimento_id = excluded.esperimento_id, nome = excluded.nome $$,
  'P0001', 'ESPERIMENTO_NON_MODIFICABILE',
  'nemmeno con un upsert sull''id di un parametro dell''altro esperimento');

select throws_ok(
  $$ update passate set esperimento_id = 'e4000000-0000-0000-0000-000000000002'
      where id = 'd3000000-0000-0000-0000-000000000001' $$,
  'P0001', 'ESPERIMENTO_NON_MODIFICABILE',
  'una passata non passa a un altro esperimento');

select throws_ok(
  $$ update misure set esperimento_id = 'e4000000-0000-0000-0000-000000000002'
      where id = 'a3000000-0000-0000-0000-000000000001' $$,
  'P0001', 'ESPERIMENTO_NON_MODIFICABILE',
  'una misura non passa a un altro esperimento');

reset role;
select * from finish();
rollback;
