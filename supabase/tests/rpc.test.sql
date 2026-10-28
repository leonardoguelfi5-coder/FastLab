begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Fixture (superuser): due esperimenti, ciascuno con trattamento, pianta e passata;
-- nel primo un parametro con dati (P), uno senza (Q) e una misura che usa P.
insert into auth.users (id, email, aud, role, instance_id) values
  ('a0000000-0000-0000-0000-000000000001', 'a@test.it', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

insert into esperimenti (id, nome, creato_da) values
  ('e1000000-0000-0000-0000-000000000001', 'Esperimento 1', 'a0000000-0000-0000-0000-000000000001'),
  ('e2000000-0000-0000-0000-000000000002', 'Esperimento 2', 'a0000000-0000-0000-0000-000000000001');

insert into fattori (id, esperimento_id, nome, ordine) values
  ('f1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Dose', 0);
insert into livelli (id, esperimento_id, fattore_id, nome, ordine) values
  ('11000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'Alta', 0);

insert into trattamenti (id, esperimento_id, etichetta, ordine) values
  ('71000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'T1', 0),
  ('72000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000002', 'T1', 0);
insert into trattamento_livelli (esperimento_id, trattamento_id, livello_id) values
  ('e1000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001');

insert into piante (id, esperimento_id, trattamento_id, etichetta, ordine) values
  ('b1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', '1', 0),
  ('b2000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000002', '1', 0);

insert into parametri (id, esperimento_id, nome, tipo, ordine) values
  ('c1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Altezza', 'numero', 0),
  ('c1000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'Note', 'testo', 1);

insert into passate (id, esperimento_id, nome, ordine) values
  ('d1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Settimanale', 0),
  ('d2000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000002', 'Settimanale', 0);
insert into passata_parametri (esperimento_id, passata_id, parametro_id, ordine) values
  ('e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 0);

-- aggiornato_il parte da una data passata, cosi' il trigger e' osservabile
-- (dentro una transazione now() e' costante).
insert into misure (id, esperimento_id, pianta_id, passata_id, data_rilievo, ora, valori, creato_da, aggiornato_il) values
  ('a1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
   '2026-10-28', '10:30:00', '{"c1000000-0000-0000-0000-000000000001": [12]}',
   'a0000000-0000-0000-0000-000000000001', '2020-01-01');

-- Guardia parametri
select throws_ok(
  $$ delete from parametri where id = 'c1000000-0000-0000-0000-000000000001' $$,
  'PARAMETRO_CON_DATI',
  'un parametro con dati non si elimina');

select throws_ok(
  $$ update parametri set tipo = 'testo' where id = 'c1000000-0000-0000-0000-000000000001' $$,
  'PARAMETRO_CON_DATI',
  'un parametro con dati non cambia tipo');

select lives_ok(
  $$ update parametri set nome = 'Altezza pianta' where id = 'c1000000-0000-0000-0000-000000000001' $$,
  'un parametro con dati si puo'' rinominare');

select lives_ok(
  $$ update parametri set nome = 'Altezza', tipo = 'numero' where id = 'c1000000-0000-0000-0000-000000000001' $$,
  'riscrivere lo stesso tipo non e'' un cambio di tipo');

select lives_ok(
  $$ delete from parametri where id = 'c1000000-0000-0000-0000-000000000002' $$,
  'un parametro senza dati si elimina');

-- FK composte: niente riferimenti incrociati tra esperimenti
select throws_ok(
  $$ insert into misure (id, esperimento_id, pianta_id, passata_id, data_rilievo, ora, creato_da)
     values (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000001',
             'b2000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001',
             '2026-10-28', '11:00:00', 'a0000000-0000-0000-0000-000000000001') $$,
  '23503', null,
  'una misura non puo'' usare la pianta di un altro esperimento');

select throws_ok(
  $$ insert into misure (id, esperimento_id, pianta_id, passata_id, data_rilievo, ora, creato_da)
     values (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000001',
             'b1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000002',
             '2026-10-28', '11:00:00', 'a0000000-0000-0000-0000-000000000001') $$,
  '23503', null,
  'una misura non puo'' usare la passata di un altro esperimento');

select throws_ok(
  $$ insert into piante (esperimento_id, trattamento_id, etichetta, ordine)
     values ('e1000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000002', '2', 1) $$,
  '23503', null,
  'una pianta non puo'' usare il trattamento di un altro esperimento');

-- Etichette pianta uniche per esperimento, senza badare a spazi e maiuscole
select throws_ok(
  $$ insert into piante (esperimento_id, trattamento_id, etichetta, ordine)
     values ('e1000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', ' 1 ', 1) $$,
  '23505', null,
  'etichetta pianta duplicata nello stesso esperimento');

-- Trigger aggiornato_il
update misure set valori = '{"c1000000-0000-0000-0000-000000000001": [13]}'
 where id = 'a1000000-0000-0000-0000-000000000001';
select ok(
  (select aggiornato_il = now() from misure where id = 'a1000000-0000-0000-0000-000000000001'),
  'update di una misura aggiorna aggiornato_il');

-- Cancellazione a cascata di un esperimento completo di dati
select lives_ok(
  $$ delete from esperimenti where id = 'e1000000-0000-0000-0000-000000000001' $$,
  'un esperimento con dati si elimina a cascata');

select is(
  (select count(*)::int from (
     select 1 from misure where esperimento_id = 'e1000000-0000-0000-0000-000000000001'
     union all select 1 from piante where esperimento_id = 'e1000000-0000-0000-0000-000000000001'
     union all select 1 from trattamenti where esperimento_id = 'e1000000-0000-0000-0000-000000000001'
     union all select 1 from parametri where esperimento_id = 'e1000000-0000-0000-0000-000000000001'
     union all select 1 from passate where esperimento_id = 'e1000000-0000-0000-0000-000000000001'
     union all select 1 from fattori where esperimento_id = 'e1000000-0000-0000-0000-000000000001'
   ) x),
  0,
  'nessuna riga figlia rimane dopo la cancellazione');

select * from finish();
rollback;
