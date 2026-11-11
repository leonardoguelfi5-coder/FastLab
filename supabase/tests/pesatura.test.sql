begin;
create extension if not exists pgtap with schema extensions;
select plan(58);

-- Pesatura: analisi dell'utente, sessioni dell'esperimento, campioni e pesi, con le loro sicurezze.
-- Fixture (superuser): A proprietario di EA, R rilevatore in EA, L lettore in EA, B estraneo (proprietario di EB).
-- In EA il trattamento T1 con le piante 1 e 2; B ha una sua analisi, che A non vede.

-- ===== Utenti ed esperimenti =====
insert into inviti (email, codice) values
  ('a.pesatura@test.it', 'PESATA01'), ('r.pesatura@test.it', 'PESATR01'),
  ('l.pesatura@test.it', 'PESATL01'), ('b.pesatura@test.it', 'PESATB01');
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('01100000-0000-0000-0000-00000000000a', 'a.pesatura@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'PESATA01')),
  ('01100000-0000-0000-0000-00000000000b', 'r.pesatura@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'PESATR01')),
  ('01100000-0000-0000-0000-00000000000c', 'l.pesatura@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'PESATL01')),
  ('01100000-0000-0000-0000-00000000000d', 'b.pesatura@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'PESATB01'));

insert into esperimenti (id, nome, creato_da) values
  ('e1100000-0000-0000-0000-000000000001', 'EA', '01100000-0000-0000-0000-00000000000a'),
  ('e1200000-0000-0000-0000-000000000001', 'EB', '01100000-0000-0000-0000-00000000000d');
insert into membri_esperimento (esperimento_id, utente_id, ruolo) values
  ('e1100000-0000-0000-0000-000000000001', '01100000-0000-0000-0000-00000000000b', 'rilevatore'),
  ('e1100000-0000-0000-0000-000000000001', '01100000-0000-0000-0000-00000000000c', 'lettore');

insert into trattamenti (id, esperimento_id, etichetta, ordine) values
  ('71100000-0000-0000-0000-000000000001', 'e1100000-0000-0000-0000-000000000001', 'T1', 0);
insert into piante (id, esperimento_id, trattamento_id, etichetta, ordine) values
  ('b1100000-0000-0000-0000-000000000001', 'e1100000-0000-0000-0000-000000000001', '71100000-0000-0000-0000-000000000001', '1', 0),
  ('b1100000-0000-0000-0000-000000000002', 'e1100000-0000-0000-0000-000000000001', '71100000-0000-0000-0000-000000000001', '2', 1);

insert into analisi_pesatura (id, creato_da, titolo, tipo) values
  ('a1200000-0000-0000-0000-000000000001', '01100000-0000-0000-0000-00000000000d', 'Analisi di B', 'aliquota');

-- ===== Struttura =====
select has_table('public', 'analisi_pesatura', 'la tabella analisi_pesatura esiste');
select has_table('public', 'sessioni_pesatura', 'la tabella sessioni_pesatura esiste');
select has_table('public', 'campioni_pesatura', 'la tabella campioni_pesatura esiste');
select has_table('public', 'pesi', 'la tabella pesi esiste');

select is_empty(
  $$ select t.tabella
       from unnest(array['analisi_pesatura', 'sessioni_pesatura', 'campioni_pesatura', 'pesi']) as t (tabella)
      where (select array_agg(cmd::text order by cmd) from pg_policies
              where schemaname = 'public' and tablename = t.tabella
                and roles @> array['authenticated']::name[] and cardinality(roles) = 1)
            is distinct from array['DELETE', 'INSERT', 'SELECT', 'UPDATE']
         or (select count(*) from pg_policies where schemaname = 'public' and tablename = t.tabella) <> 4 $$,
  'ogni tabella della Pesatura ha una policy per operazione, solo per authenticated');

select is_empty(
  $$ select t.tabella
       from unnest(array['analisi_pesatura', 'sessioni_pesatura', 'campioni_pesatura', 'pesi']) as t (tabella)
      where not exists (
        select 1 from pg_trigger g
         where g.tgrelid = ('public.' || t.tabella)::regclass
           and g.tgfoid = 'public.imposta_aggiornato_il()'::regprocedure) $$,
  'ogni tabella della Pesatura ha il trigger di aggiornato_il');

select has_trigger('public', 'analisi_pesatura', 'guardia_tipo_analisi', 'le analisi hanno la guardia del tipo');

select is_empty(
  $$ select p.proname from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = 'puo_gestire_sessione'
        and not (p.prosecdef and p.proconfig = array['search_path=""']
                 and has_function_privilege('authenticated', p.oid, 'execute')
                 and not has_function_privilege('anon', p.oid, 'execute'))
     union all
     select 'manca' where not exists (
       select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'puo_gestire_sessione') $$,
  'puo_gestire_sessione e'' security definer, con search_path vuoto, per authenticated e non per anon');

-- ===== A: analisi, sessione, campioni, un peso =====
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '01100000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ insert into analisi_pesatura (id, titolo, tipo)
     values ('a1100000-0000-0000-0000-000000000001', 'Antociani foglie', 'aliquota'),
            ('a1100000-0000-0000-0000-000000000002', 'RWC', 'rwc') $$,
  'A crea due analisi');

select results_eq(
  $$ select unita, impostazioni, archiviata, creato_da from analisi_pesatura
      where id = 'a1100000-0000-0000-0000-000000000001' $$,
  $$ values ('g'::text, '{}'::jsonb, false, '01100000-0000-0000-0000-00000000000a'::uuid) $$,
  'un''analisi nuova pesa in grammi, non ha impostazioni, non e'' archiviata ed e'' firmata da chi la crea');

select throws_ok(
  $$ insert into analisi_pesatura (id, titolo, tipo, creato_da)
     values ('a1100000-0000-0000-0000-000000000009', 'Finta', 'aliquota', '01100000-0000-0000-0000-00000000000b') $$,
  '42501', null,
  'A non crea un''analisi a nome di R');

select is(
  (select count(*)::int from analisi_pesatura where id = 'a1200000-0000-0000-0000-000000000001'),
  0,
  'A non vede l''analisi di B (non e'' sua e nessuna sessione di un suo esperimento la usa)');

select lives_ok(
  $$ insert into sessioni_pesatura (id, esperimento_id, analisi_id, titolo, tipo, unita, impostazioni, data)
     values ('51100000-0000-0000-0000-000000000001', 'e1100000-0000-0000-0000-000000000001',
             'a1100000-0000-0000-0000-000000000001', 'Antociani foglie', 'aliquota', 'g', '{}', '2026-11-11') $$,
  'A crea una sessione in EA con la sua analisi');

select throws_ok(
  $$ insert into sessioni_pesatura (id, esperimento_id, analisi_id, titolo, tipo, unita, impostazioni, data)
     values ('51100000-0000-0000-0000-000000000009', 'e1100000-0000-0000-0000-000000000001',
             'a1200000-0000-0000-0000-000000000001', 'Analisi di B', 'aliquota', 'g', '{}', '2026-11-11') $$,
  '42501', null,
  'A non crea una sessione con un''analisi che non vede');

select lives_ok(
  $$ insert into campioni_pesatura (id, sessione_id, esperimento_id, pianta_id, nome, ordine)
     values ('c1100000-0000-0000-0000-000000000001', '51100000-0000-0000-0000-000000000001',
             'e1100000-0000-0000-0000-000000000001', 'b1100000-0000-0000-0000-000000000001', null, 0),
            ('c1100000-0000-0000-0000-000000000002', '51100000-0000-0000-0000-000000000001',
             'e1100000-0000-0000-0000-000000000001', null, 'Bianco', 1) $$,
  'A aggiunge alla sessione un campione di una pianta e uno con un nome libero');

select lives_ok(
  $$ insert into pesi (id, campione_id, sessione_id, esperimento_id, tipo, valore)
     values ('d1100000-0000-0000-0000-000000000001', 'c1100000-0000-0000-0000-000000000001',
             '51100000-0000-0000-0000-000000000001', 'e1100000-0000-0000-0000-000000000001', 'aliquota', 0.0512) $$,
  'A inserisce un peso');

select results_eq(
  $$ select replica, creato_da, misurato_il is not null from pesi where id = 'd1100000-0000-0000-0000-000000000001' $$,
  $$ values (1, '01100000-0000-0000-0000-00000000000a'::uuid, true) $$,
  'un peso nuovo e'' la replica 1, firmato da chi lo inserisce, con l''ora della pesata');

-- ===== R, rilevatore =====
select set_config('request.jwt.claims',
  json_build_object('sub', '01100000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);

select is(
  array[(select count(*)::int from sessioni_pesatura), (select count(*)::int from analisi_pesatura),
        (select count(*)::int from campioni_pesatura), (select count(*)::int from pesi)],
  array[1, 1, 2, 1],
  'R vede la sessione di A, la sua analisi (non l''altra di A, senza sessioni), i campioni e il peso');

select lives_ok(
  $$ insert into pesi (id, campione_id, sessione_id, esperimento_id, tipo, valore)
     values ('d1100000-0000-0000-0000-000000000002', 'c1100000-0000-0000-0000-000000000002',
             '51100000-0000-0000-0000-000000000001', 'e1100000-0000-0000-0000-000000000001', 'aliquota', 0.0498) $$,
  'R inserisce un peso nella sessione di A');

select is(
  (select creato_da from pesi where id = 'd1100000-0000-0000-0000-000000000002'),
  '01100000-0000-0000-0000-00000000000b'::uuid,
  'il peso di R e'' firmato a nome di R');

select throws_ok(
  $$ insert into pesi (id, campione_id, sessione_id, esperimento_id, tipo, valore, creato_da)
     values ('d1100000-0000-0000-0000-000000000003', 'c1100000-0000-0000-0000-000000000002',
             '51100000-0000-0000-0000-000000000001', 'e1100000-0000-0000-0000-000000000001', 'fresco', 1.2,
             '01100000-0000-0000-0000-00000000000a') $$,
  '42501', null,
  'R non inserisce un peso firmato a nome di A');

select is_empty(
  $$ update pesi set valore = 0.06 where id = 'd1100000-0000-0000-0000-000000000001' returning id $$,
  'R non modifica il peso di A (0 righe)');

select is_empty(
  $$ delete from pesi where id = 'd1100000-0000-0000-0000-000000000001' returning id $$,
  'R non elimina il peso di A (0 righe)');

select isnt_empty(
  $$ update pesi set valore = 0.0499, lettura = 12 where id = 'd1100000-0000-0000-0000-000000000002' returning id $$,
  'R corregge il proprio peso');

select throws_ok(
  $$ update pesi set creato_da = '01100000-0000-0000-0000-00000000000a' where id = 'd1100000-0000-0000-0000-000000000002' $$,
  '42501', null,
  'creato_da di un peso non si modifica');

select throws_ok(
  $$ insert into campioni_pesatura (id, sessione_id, esperimento_id, pianta_id, nome, ordine)
     values ('c1100000-0000-0000-0000-000000000003', '51100000-0000-0000-0000-000000000001',
             'e1100000-0000-0000-0000-000000000001', 'b1100000-0000-0000-0000-000000000002', null, 2) $$,
  '42501', null,
  'R non aggiunge campioni alla sessione di A');

select is_empty(
  $$ update campioni_pesatura set ordine = 5 where id = 'c1100000-0000-0000-0000-000000000001' returning id $$,
  'R non modifica i campioni della sessione di A (0 righe)');

select is_empty(
  $$ update sessioni_pesatura set conclusa = true where id = '51100000-0000-0000-0000-000000000001' returning id $$,
  'R non chiude la sessione di A (0 righe)');

select is_empty(
  $$ update analisi_pesatura set titolo = 'Rinominata' where id = 'a1100000-0000-0000-0000-000000000001' returning id $$,
  'R non rinomina l''analisi di A (0 righe)');

select lives_ok(
  $$ insert into sessioni_pesatura (id, esperimento_id, analisi_id, titolo, tipo, unita, impostazioni, data)
     values ('51100000-0000-0000-0000-000000000002', 'e1100000-0000-0000-0000-000000000001',
             'a1100000-0000-0000-0000-000000000001', 'Antociani foglie', 'aliquota', 'g', '{}', '2026-11-12') $$,
  'R crea una sessione con l''analisi di A, che vede');

select lives_ok(
  $$ insert into campioni_pesatura (id, sessione_id, esperimento_id, pianta_id, nome, ordine)
     values ('c1100000-0000-0000-0000-000000000004', '51100000-0000-0000-0000-000000000002',
             'e1100000-0000-0000-0000-000000000001', 'b1100000-0000-0000-0000-000000000002', null, 0) $$,
  'R aggiunge campioni alla propria sessione');

select isnt_empty(
  $$ update sessioni_pesatura set nota = 'Pesate al mattino' where id = '51100000-0000-0000-0000-000000000002' returning id $$,
  'R modifica la propria sessione');

select throws_ok(
  $$ update sessioni_pesatura set creato_da = '01100000-0000-0000-0000-00000000000a'
      where id = '51100000-0000-0000-0000-000000000002' $$,
  '42501', null,
  'creato_da di una sessione non si modifica');

-- ===== L, lettore =====
select set_config('request.jwt.claims',
  json_build_object('sub', '01100000-0000-0000-0000-00000000000c', 'role', 'authenticated')::text, true);

select is(
  array[(select count(*)::int from sessioni_pesatura), (select count(*)::int from campioni_pesatura),
        (select count(*)::int from pesi)],
  array[2, 3, 2],
  'L legge sessioni, campioni e pesi di EA');

select throws_ok(
  $$ insert into pesi (id, campione_id, sessione_id, esperimento_id, tipo, valore)
     values ('d1100000-0000-0000-0000-000000000004', 'c1100000-0000-0000-0000-000000000001',
             '51100000-0000-0000-0000-000000000001', 'e1100000-0000-0000-0000-000000000001', 'fresco', 1.1) $$,
  '42501', null,
  'L non inserisce pesi');

select throws_ok(
  $$ insert into sessioni_pesatura (id, esperimento_id, analisi_id, titolo, tipo, unita, impostazioni, data)
     values ('51100000-0000-0000-0000-000000000003', 'e1100000-0000-0000-0000-000000000001',
             'a1100000-0000-0000-0000-000000000001', 'Antociani foglie', 'aliquota', 'g', '{}', '2026-11-12') $$,
  '42501', null,
  'L non crea sessioni');

-- ===== B, estraneo =====
select set_config('request.jwt.claims',
  json_build_object('sub', '01100000-0000-0000-0000-00000000000d', 'role', 'authenticated')::text, true);

select is(
  array[(select count(*)::int from sessioni_pesatura), (select count(*)::int from campioni_pesatura),
        (select count(*)::int from pesi),
        (select count(*)::int from analisi_pesatura where creato_da <> '01100000-0000-0000-0000-00000000000d')],
  array[0, 0, 0, 0],
  'B non vede sessioni, campioni, pesi ne'' analisi di EA');

select throws_ok(
  $$ insert into pesi (id, campione_id, sessione_id, esperimento_id, tipo, valore)
     values ('d1100000-0000-0000-0000-000000000005', 'c1100000-0000-0000-0000-000000000001',
             '51100000-0000-0000-0000-000000000001', 'e1100000-0000-0000-0000-000000000001', 'fresco', 1.1) $$,
  '42501', null,
  'B non inserisce pesi in EA');

-- ===== Di nuovo A, proprietario: corregge tutto, poi i vincoli =====
select set_config('request.jwt.claims',
  json_build_object('sub', '01100000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);

select isnt_empty(
  $$ update pesi set valore = 0.05 where id = 'd1100000-0000-0000-0000-000000000002' returning id $$,
  'A corregge il peso di R');

select isnt_empty(
  $$ update campioni_pesatura set substrato = 'Torba' where id = 'c1100000-0000-0000-0000-000000000004' returning id $$,
  'A modifica i campioni della sessione di R');

select isnt_empty(
  $$ update sessioni_pesatura set conclusa = true where id = '51100000-0000-0000-0000-000000000002' returning id $$,
  'A chiude la sessione di R');

select lives_ok(
  $$ insert into pesi (id, campione_id, sessione_id, esperimento_id, tipo, valore)
     values ('d1100000-0000-0000-0000-000000000006', 'c1100000-0000-0000-0000-000000000001',
             '51100000-0000-0000-0000-000000000001', 'e1100000-0000-0000-0000-000000000001', 'fresco', 1.2) $$,
  'A inserisce il peso fresco della replica 1');

select throws_ok(
  $$ insert into pesi (id, campione_id, sessione_id, esperimento_id, tipo, valore)
     values ('d1100000-0000-0000-0000-000000000007', 'c1100000-0000-0000-0000-000000000001',
             '51100000-0000-0000-0000-000000000001', 'e1100000-0000-0000-0000-000000000001', 'fresco', 1.3) $$,
  '23505', null,
  'un secondo peso fresco della stessa replica dello stesso campione: rifiutato');

select lives_ok(
  $$ insert into pesi (id, campione_id, sessione_id, esperimento_id, tipo, valore, lettura)
     values ('d1100000-0000-0000-0000-000000000008', 'c1100000-0000-0000-0000-000000000001',
             '51100000-0000-0000-0000-000000000001', 'e1100000-0000-0000-0000-000000000001', 'asciugatura', 950, 10),
            ('d1100000-0000-0000-0000-000000000009', 'c1100000-0000-0000-0000-000000000001',
             '51100000-0000-0000-0000-000000000001', 'e1100000-0000-0000-0000-000000000001', 'asciugatura', 900, 25) $$,
  'piu'' punti di asciugatura sullo stesso campione e replica: ammessi');

select throws_ok(
  $$ insert into pesi (id, campione_id, sessione_id, esperimento_id, tipo, valore)
     values ('d1100000-0000-0000-0000-00000000000a', 'c1100000-0000-0000-0000-000000000001',
             '51100000-0000-0000-0000-000000000001', 'e1100000-0000-0000-0000-000000000001', 'secco', 0) $$,
  '23514', null,
  'un peso uguale a 0: rifiutato');

select throws_ok(
  $$ insert into pesi (id, campione_id, sessione_id, esperimento_id, tipo, valore)
     values ('d1100000-0000-0000-0000-00000000000b', 'c1100000-0000-0000-0000-000000000001',
             '51100000-0000-0000-0000-000000000002', 'e1100000-0000-0000-0000-000000000001', 'secco', 0.3) $$,
  '23503', null,
  'un peso non si attacca al campione di un''altra sessione');

select throws_ok(
  $$ insert into campioni_pesatura (id, sessione_id, esperimento_id, pianta_id, nome, ordine)
     values ('c1100000-0000-0000-0000-000000000005', '51100000-0000-0000-0000-000000000001',
             'e1100000-0000-0000-0000-000000000001', 'b1100000-0000-0000-0000-000000000002', 'Doppio', 3) $$,
  '23514', null,
  'un campione con sia la pianta sia il nome: rifiutato');

select throws_ok(
  $$ insert into campioni_pesatura (id, sessione_id, esperimento_id, pianta_id, nome, ordine)
     values ('c1100000-0000-0000-0000-000000000006', '51100000-0000-0000-0000-000000000001',
             'e1100000-0000-0000-0000-000000000001', null, null, 3) $$,
  '23514', null,
  'un campione senza pianta e senza nome: rifiutato');

select throws_ok(
  $$ update analisi_pesatura set tipo = 'rwc' where id = 'a1100000-0000-0000-0000-000000000001' $$,
  '23514', 'il tipo di un''analisi con sessioni non si cambia',
  'il tipo di un''analisi con sessioni non si cambia');

select lives_ok(
  $$ update analisi_pesatura set unita = 'mg', titolo = 'Antociani' where id = 'a1100000-0000-0000-0000-000000000001' $$,
  'unita'' e titolo di un''analisi con sessioni si cambiano');

select lives_ok(
  $$ update analisi_pesatura set tipo = 'vasi' where id = 'a1100000-0000-0000-0000-000000000002' $$,
  'il tipo di un''analisi senza sessioni si cambia');

select throws_ok(
  $$ delete from analisi_pesatura where id = 'a1100000-0000-0000-0000-000000000001' $$,
  '23503', null,
  'un''analisi con sessioni non si elimina');

select lives_ok(
  $$ update analisi_pesatura set archiviata = true where id = 'a1100000-0000-0000-0000-000000000001' $$,
  'un''analisi con sessioni si archivia');

select results_eq(
  $$ select p from piante_non_eliminabili('e1100000-0000-0000-0000-000000000001') as p order by 1 $$,
  $$ values ('b1100000-0000-0000-0000-000000000001'::uuid), ('b1100000-0000-0000-0000-000000000002'::uuid) $$,
  'piante_non_eliminabili: le piante usate nei campioni della Pesatura');

select throws_ok(
  $$ delete from piante where id = 'b1100000-0000-0000-0000-000000000001' $$,
  '23503', null,
  'una pianta usata in un campione non si elimina');

select lives_ok(
  $$ delete from esperimenti where id = 'e1100000-0000-0000-0000-000000000001' $$,
  'A elimina EA con le sue sessioni di pesatura');

reset role;
select is(
  array[(select count(*)::int from sessioni_pesatura), (select count(*)::int from campioni_pesatura),
        (select count(*)::int from pesi), (select count(*)::int from analisi_pesatura)],
  array[0, 0, 0, 3],
  'l''eliminazione dell''esperimento porta via sessioni, campioni e pesi, e lascia le analisi');

-- ===== anon =====
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

select throws_ok(
  $$ select count(*) from analisi_pesatura $$,
  '42501', null,
  'anon non legge le analisi');

reset role;
select * from finish();
rollback;
