begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- Fixture (superuser): due esperimenti, ciascuno con trattamento, pianta e passata;
-- nel primo un parametro con dati (P), uno senza (Q) e una misura che usa P.
-- L'utente si registra solo con un invito.
insert into inviti (email) values ('a@test.it');
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

-- ===== RPC, come utente A autenticato =====
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'a0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

-- crea_esperimento: bozza completa (1 fattore con 2 livelli, 2 trattamenti, 3 piante,
-- 2 parametri, 1 passata con 2 parametri).
select is(
  crea_esperimento('{
    "esperimento": {"id": "e3000000-0000-0000-0000-000000000003", "nome": "Prova RPC", "data_inizio": "2026-10-01",
                    "note": "nota", "stato": "in_corso"},
    "fattori": [{"id": "f3000000-0000-0000-0000-000000000001", "nome": "Dose", "ordine": 0, "livelli": [
      {"id": "13000000-0000-0000-0000-000000000001", "nome": "Bassa", "ordine": 0},
      {"id": "13000000-0000-0000-0000-000000000002", "nome": "Alta", "ordine": 1}]}],
    "trattamenti": [
      {"id": "73000000-0000-0000-0000-000000000001", "etichetta": "Bassa", "ordine": 0,
       "livello_ids": ["13000000-0000-0000-0000-000000000001"]},
      {"id": "73000000-0000-0000-0000-000000000002", "etichetta": "Alta", "ordine": 1,
       "livello_ids": ["13000000-0000-0000-0000-000000000002"]}],
    "piante": [
      {"id": "b3000000-0000-0000-0000-000000000001", "trattamento_id": "73000000-0000-0000-0000-000000000001",
       "etichetta": "1", "blocco": "I", "ordine": 0},
      {"id": "b3000000-0000-0000-0000-000000000002", "trattamento_id": "73000000-0000-0000-0000-000000000002",
       "etichetta": "2", "blocco": "I", "ordine": 1},
      {"id": "b3000000-0000-0000-0000-000000000003", "trattamento_id": "73000000-0000-0000-0000-000000000001",
       "etichetta": "3", "blocco": null, "ordine": 2}],
    "parametri": [
      {"id": "c3000000-0000-0000-0000-000000000001", "nome": "Altezza", "unita": "cm", "tipo": "numero", "ordine": 0,
       "archiviato": false, "progressivo": true, "ricorda_tra_piante": true, "n_letture": 3,
       "valore_min": 0, "valore_max": 300, "sotto_campi": []},
      {"id": "c3000000-0000-0000-0000-000000000002", "nome": "Foglie", "unita": null, "tipo": "lista", "ordine": 1,
       "archiviato": false, "progressivo": false, "ricorda_tra_piante": false, "n_letture": 1,
       "valore_min": null, "valore_max": null, "sotto_campi": [{"chiave": "l", "nome": "Lunghezza", "unita": "cm"}]}],
    "passate": [{"id": "d3000000-0000-0000-0000-000000000001", "nome": "Settimanale", "icona": "ruler", "ordine": 0,
      "parametri": [
        {"parametro_id": "c3000000-0000-0000-0000-000000000001", "obbligatorio": true, "ordine": 0},
        {"parametro_id": "c3000000-0000-0000-0000-000000000002", "obbligatorio": false, "ordine": 1}]}]
  }'::jsonb),
  'e3000000-0000-0000-0000-000000000003'::uuid,
  'crea_esperimento restituisce l''id della bozza');

select is(
  array[(select count(*)::int from esperimenti where id = 'e3000000-0000-0000-0000-000000000003'),
        (select count(*)::int from fattori where esperimento_id = 'e3000000-0000-0000-0000-000000000003'),
        (select count(*)::int from livelli where esperimento_id = 'e3000000-0000-0000-0000-000000000003'),
        (select count(*)::int from trattamenti where esperimento_id = 'e3000000-0000-0000-0000-000000000003'),
        (select count(*)::int from trattamento_livelli where esperimento_id = 'e3000000-0000-0000-0000-000000000003'),
        (select count(*)::int from piante where esperimento_id = 'e3000000-0000-0000-0000-000000000003'),
        (select count(*)::int from parametri where esperimento_id = 'e3000000-0000-0000-0000-000000000003'),
        (select count(*)::int from passate where esperimento_id = 'e3000000-0000-0000-0000-000000000003'),
        (select count(*)::int from passata_parametri where esperimento_id = 'e3000000-0000-0000-0000-000000000003')],
  array[1, 1, 2, 2, 2, 3, 2, 1, 2],
  'crea_esperimento inserisce tutte le righe della bozza con l''esperimento_id della bozza');

select results_eq(
  $$ select nome, data_inizio, note, stato, creato_da from esperimenti
      where id = 'e3000000-0000-0000-0000-000000000003' $$,
  $$ values ('Prova RPC'::text, '2026-10-01'::date, 'nota'::text, 'in_corso'::text,
             'a0000000-0000-0000-0000-000000000001'::uuid) $$,
  'l''esperimento ha i campi della bozza e creato_da = utente');

select results_eq(
  $$ select nome, unita, tipo, ordine, archiviato, progressivo, ricorda_tra_piante, n_letture,
            valore_min, valore_max, sotto_campi
       from parametri where esperimento_id = 'e3000000-0000-0000-0000-000000000003' order by ordine $$,
  $$ values ('Altezza'::text, 'cm'::text, 'numero'::text, 0, false, true, true, 3, 0::numeric, 300::numeric, '[]'::jsonb),
            ('Foglie', null, 'lista', 1, false, false, false, 1, null, null,
             '[{"chiave": "l", "nome": "Lunghezza", "unita": "cm"}]') $$,
  'i parametri hanno tutti i campi della bozza');

select results_eq(
  $$ select p.etichetta, p.blocco, t.etichetta, l.nome
       from piante p
       join trattamenti t on t.id = p.trattamento_id
       join trattamento_livelli tl on tl.trattamento_id = t.id
       join livelli l on l.id = tl.livello_id
      where p.esperimento_id = 'e3000000-0000-0000-0000-000000000003'
      order by p.ordine $$,
  $$ values ('1'::text, 'I'::text, 'Bassa'::text, 'Bassa'::text),
            ('2', 'I', 'Alta', 'Alta'),
            ('3', null, 'Bassa', 'Bassa') $$,
  'piante, trattamenti e livelli sono collegati come nella bozza');

select results_eq(
  $$ select pa.nome, pa.icona, pp.parametro_id, pp.obbligatorio, pp.ordine
       from passata_parametri pp join passate pa on pa.id = pp.passata_id
      where pp.esperimento_id = 'e3000000-0000-0000-0000-000000000003'
      order by pp.ordine $$,
  $$ values ('Settimanale'::text, 'ruler'::text, 'c3000000-0000-0000-0000-000000000001'::uuid, true, 0),
            ('Settimanale', 'ruler', 'c3000000-0000-0000-0000-000000000002', false, 1) $$,
  'la passata ha i parametri della bozza');

select is(
  (select ruolo from membri_esperimento
    where esperimento_id = 'e3000000-0000-0000-0000-000000000003'
      and utente_id = 'a0000000-0000-0000-0000-000000000001'),
  'proprietario',
  'chi crea l''esperimento ne e'' il proprietario');

-- Atomicita': la seconda pianta ha un'etichetta duplicata, nulla della bozza deve restare.
select throws_ok(
  $$ select crea_esperimento('{
       "esperimento": {"id": "e4000000-0000-0000-0000-000000000004", "nome": "Bozza sbagliata", "data_inizio": null,
                       "note": "", "stato": "in_corso"},
       "fattori": [{"id": "f4000000-0000-0000-0000-000000000001", "nome": "Dose", "ordine": 0,
                    "livelli": [{"id": "14000000-0000-0000-0000-000000000001", "nome": "Alta", "ordine": 0}]}],
       "trattamenti": [{"id": "74000000-0000-0000-0000-000000000001", "etichetta": "Alta", "ordine": 0,
                        "livello_ids": ["14000000-0000-0000-0000-000000000001"]}],
       "piante": [
         {"id": "b4000000-0000-0000-0000-000000000001", "trattamento_id": "74000000-0000-0000-0000-000000000001",
          "etichetta": "1", "blocco": null, "ordine": 0},
         {"id": "b4000000-0000-0000-0000-000000000002", "trattamento_id": "74000000-0000-0000-0000-000000000001",
          "etichetta": " 1", "blocco": null, "ordine": 1}],
       "parametri": [{"id": "c4000000-0000-0000-0000-000000000001", "nome": "Altezza", "unita": "cm", "tipo": "numero",
                      "ordine": 0, "archiviato": false, "progressivo": false, "ricorda_tra_piante": false,
                      "n_letture": 1, "valore_min": null, "valore_max": null, "sotto_campi": []}],
       "passate": [{"id": "d4000000-0000-0000-0000-000000000001", "nome": "Settimanale", "icona": null, "ordine": 0,
                    "parametri": [{"parametro_id": "c4000000-0000-0000-0000-000000000001", "obbligatorio": false,
                                   "ordine": 0}]}]
     }'::jsonb) $$,
  '23505', null,
  'crea_esperimento con due piante "1" e " 1" fallisce');

-- Il conteggio si fa da superuser, cosi' RLS non nasconde eventuali avanzi.
reset role;
select is(
  (select count(*)::int from (
     select 1 from esperimenti where id = 'e4000000-0000-0000-0000-000000000004'
     union all select 1 from membri_esperimento where esperimento_id = 'e4000000-0000-0000-0000-000000000004'
     union all select 1 from fattori where esperimento_id = 'e4000000-0000-0000-0000-000000000004'
     union all select 1 from livelli where esperimento_id = 'e4000000-0000-0000-0000-000000000004'
     union all select 1 from trattamenti where esperimento_id = 'e4000000-0000-0000-0000-000000000004'
     union all select 1 from trattamento_livelli where esperimento_id = 'e4000000-0000-0000-0000-000000000004'
     union all select 1 from piante where esperimento_id = 'e4000000-0000-0000-0000-000000000004'
     union all select 1 from parametri where esperimento_id = 'e4000000-0000-0000-0000-000000000004'
     union all select 1 from passate where esperimento_id = 'e4000000-0000-0000-0000-000000000004'
     union all select 1 from passata_parametri where esperimento_id = 'e4000000-0000-0000-0000-000000000004'
   ) x),
  0,
  'crea_esperimento e'' atomica: della bozza fallita non resta nessuna riga');

-- Misure su e3: pianta 1 il 20/10 e due volte il 28/10, pianta 2 il 28/10; solo "Altezza" ha dati.
set local role authenticated;
insert into misure (id, esperimento_id, pianta_id, passata_id, data_rilievo, ora, valori) values
  ('a3000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000003',
   'b3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001',
   '2026-10-20', '09:00', '{"c3000000-0000-0000-0000-000000000001": [10, 11, 12]}'),
  ('a3000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000003',
   'b3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001',
   '2026-10-28', '09:00', '{"c3000000-0000-0000-0000-000000000001": [20, 21, 22]}'),
  ('a3000000-0000-0000-0000-000000000003', 'e3000000-0000-0000-0000-000000000003',
   'b3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001',
   '2026-10-28', '11:00', '{"c3000000-0000-0000-0000-000000000001": [21, 22, 23]}'),
  ('a3000000-0000-0000-0000-000000000004', 'e3000000-0000-0000-0000-000000000003',
   'b3000000-0000-0000-0000-000000000002', 'd3000000-0000-0000-0000-000000000001',
   '2026-10-28', '10:00', '{"c3000000-0000-0000-0000-000000000001": [30, null, null]}');

select is(
  (select piante_ultima_data from riepilogo_esperimenti()
    where id = 'e3000000-0000-0000-0000-000000000003'),
  2,
  'riepilogo_esperimenti: misure su 2 piante diverse nella stessa data danno piante_ultima_data = 2');

select results_eq(
  $$ select nome, stato, data_inizio, n_piante, n_trattamenti, ultima_data from riepilogo_esperimenti()
      where id = 'e3000000-0000-0000-0000-000000000003' $$,
  $$ values ('Prova RPC'::text, 'in_corso'::text, '2026-10-01'::date, 3, 2, '2026-10-28'::date) $$,
  'riepilogo_esperimenti: nome, stato, conteggi e ultima data');

select results_eq(
  $$ select n_piante, n_trattamenti, ultima_data, piante_ultima_data from riepilogo_esperimenti()
      where id = 'e2000000-0000-0000-0000-000000000002' $$,
  $$ values (1, 1, null::date, 0) $$,
  'riepilogo_esperimenti: esperimento senza misure');

reset role;
update esperimenti set creato_il = '2020-01-01' where id = 'e2000000-0000-0000-0000-000000000002';
set local role authenticated;
select results_eq(
  $$ select id from riepilogo_esperimenti() $$,
  $$ values ('e3000000-0000-0000-0000-000000000003'::uuid), ('e2000000-0000-0000-0000-000000000002'::uuid) $$,
  'riepilogo_esperimenti e'' ordinato dal piu'' recente');

select results_eq(
  $$ select * from parametri_con_dati('e3000000-0000-0000-0000-000000000003') $$,
  $$ values ('c3000000-0000-0000-0000-000000000001'::uuid) $$,
  'parametri_con_dati restituisce l''id del parametro usato');

select set_eq(
  $$ select * from piante_con_dati('e3000000-0000-0000-0000-000000000003') $$,
  $$ values ('b3000000-0000-0000-0000-000000000001'::uuid), ('b3000000-0000-0000-0000-000000000002'::uuid) $$,
  'piante_con_dati restituisce le piante con almeno una misura');

reset role;

select * from finish();
rollback;
