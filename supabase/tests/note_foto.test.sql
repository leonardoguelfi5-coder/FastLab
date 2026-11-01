begin;
create extension if not exists pgtap with schema extensions;
select plan(74);

-- Fixture (superuser): A e' membro di due esperimenti (EA e EA2), B di uno (EB). In EA: il
-- trattamento T1 con le piante 1 e 2 e il trattamento T2 senza piante; in EA2 la pianta 9; in EB la pianta 1 di B.
insert into inviti (email, codice) values ('a.note@test.it', 'CODICEN2'), ('b.note@test.it', 'CODICEN3');
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('0e000000-0000-0000-0000-00000000000a', 'a.note@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'CODICEN2')),
  ('0e000000-0000-0000-0000-00000000000b', 'b.note@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'CODICEN3'));

insert into esperimenti (id, nome, creato_da) values
  ('e5000000-0000-0000-0000-000000000001', 'EA', '0e000000-0000-0000-0000-00000000000a'),
  ('e5000000-0000-0000-0000-000000000002', 'EA2', '0e000000-0000-0000-0000-00000000000a'),
  ('e6000000-0000-0000-0000-000000000001', 'EB', '0e000000-0000-0000-0000-00000000000b');

insert into trattamenti (id, esperimento_id, etichetta, ordine) values
  ('75000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 'T1', 0),
  ('75000000-0000-0000-0000-000000000003', 'e5000000-0000-0000-0000-000000000001', 'T2', 1),
  ('75000000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-000000000002', 'T1', 0),
  ('76000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000001', 'T1', 0);

insert into piante (id, esperimento_id, trattamento_id, etichetta, ordine) values
  ('b5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', '75000000-0000-0000-0000-000000000001', '1', 0),
  ('b5000000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-000000000001', '75000000-0000-0000-0000-000000000001', '2', 1),
  ('b5000000-0000-0000-0000-000000000009', 'e5000000-0000-0000-0000-000000000002', '75000000-0000-0000-0000-000000000002', '9', 0),
  ('b6000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000001', '76000000-0000-0000-0000-000000000001', '1', 0);

-- Un altro bucket, e un oggetto nel bucket foto con un percorso che non e' quello dell'app
-- (lo potrebbe creare solo il service role): non deve rompere ne' aprire nulla.
insert into storage.buckets (id, name, public) values ('altro', 'altro', false);
insert into storage.objects (bucket_id, name) values ('foto', 'non-un-uuid/x.jpg');

-- ===== Struttura =====
select is(
  (select public from storage.buckets where id = 'foto'),
  false,
  'il bucket foto esiste ed e'' privato');

select is_empty(
  $$ select policyname from pg_policies
      where schemaname = 'storage' and tablename = 'objects' and policyname like 'fastlab_foto%'
        and (cmd in ('UPDATE', 'ALL') or not (roles @> array['authenticated']::name[] and cardinality(roles) = 1)) $$,
  'le policy delle foto sullo Storage sono solo per authenticated e nessuna permette update');

select has_trigger('public', 'note', 'note_aggiornato_il', 'le note hanno il trigger di aggiornato_il');

-- ===== A: crea e legge note, collegamenti e foto =====
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '0e000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ insert into note (id, esperimento_id, data, testo)
     values ('a5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', '2026-11-01', 'Foglie gialle'),
            ('a5000000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-000000000002', '2026-11-01', 'Nota di EA2') $$,
  'A crea note nei propri esperimenti');

select results_eq(
  $$ select promemoria, fatto_il is null, creato_da from note where id = 'a5000000-0000-0000-0000-000000000001' $$,
  $$ values (false, true, '0e000000-0000-0000-0000-00000000000a'::uuid) $$,
  'una nota nuova non e'' un promemoria, non e'' fatta ed e'' firmata da chi la crea');

select lives_ok(
  $$ insert into note (id, esperimento_id, data, testo, promemoria)
     values ('a5000000-0000-0000-0000-000000000003', 'e5000000-0000-0000-0000-000000000001', '2026-11-20', 'Concimare', true) $$,
  'A crea un promemoria');

select lives_ok(
  $$ update note set fatto_il = now() where id = 'a5000000-0000-0000-0000-000000000003' $$,
  'A segna fatto il promemoria');

select lives_ok(
  $$ insert into note_piante (nota_id, pianta_id, esperimento_id)
     values ('a5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001') $$,
  'A collega la nota a una pianta');

select lives_ok(
  $$ insert into note_trattamenti (nota_id, trattamento_id, esperimento_id)
     values ('a5000000-0000-0000-0000-000000000003', '75000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001'),
            ('a5000000-0000-0000-0000-000000000003', '75000000-0000-0000-0000-000000000003', 'e5000000-0000-0000-0000-000000000001') $$,
  'A collega il promemoria a due trattamenti');

select lives_ok(
  $$ insert into foto (id, esperimento_id, data, percorso, larghezza, altezza, byte, nota_id)
     values ('f5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', '2026-11-01',
             'e5000000-0000-0000-0000-000000000001/f5000000-0000-0000-0000-000000000001.jpg', 1600, 1200, 300000,
             'a5000000-0000-0000-0000-000000000001'),
            ('f5000000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-000000000001', '2026-11-01',
             'e5000000-0000-0000-0000-000000000001/f5000000-0000-0000-0000-000000000002.jpg', 1200, 1600, 280000, null) $$,
  'A crea due foto, una della nota');

select lives_ok(
  $$ update foto set pianta_id = 'b5000000-0000-0000-0000-000000000002' where id = 'f5000000-0000-0000-0000-000000000002' $$,
  'A collega la seconda foto a una pianta');

select is(
  array[(select count(*)::int from note), (select count(*)::int from note_piante),
        (select count(*)::int from note_trattamenti), (select count(*)::int from foto)],
  array[3, 1, 2, 2],
  'A vede le sue note, i collegamenti e le foto');

select lives_ok(
  $$ insert into note (id, esperimento_id, data, testo, promemoria)
     values ('a5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', '2026-11-02', 'Foglie gialle, poi verdi', false)
     on conflict (id) do update set
       id = excluded.id, esperimento_id = excluded.esperimento_id, data = excluded.data,
       testo = excluded.testo, promemoria = excluded.promemoria $$,
  'upsert di una nota senza creato_da nel payload: riesce');

select lives_ok(
  $$ insert into note_piante (nota_id, pianta_id, esperimento_id)
     values ('a5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001')
     on conflict (nota_id, pianta_id) do update set
       nota_id = excluded.nota_id, pianta_id = excluded.pianta_id, esperimento_id = excluded.esperimento_id $$,
  'upsert di un collegamento gia'' presente: riesce');

select lives_ok(
  $$ insert into foto (id, esperimento_id, data, percorso, larghezza, altezza, byte, pianta_id, nota_id, archiviata)
     values ('f5000000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-000000000001', '2026-10-31',
             'e5000000-0000-0000-0000-000000000001/f5000000-0000-0000-0000-000000000002.jpg', 1200, 1600, 280000,
             'b5000000-0000-0000-0000-000000000002', null, false)
     on conflict (id) do update set
       id = excluded.id, esperimento_id = excluded.esperimento_id, data = excluded.data, percorso = excluded.percorso,
       larghezza = excluded.larghezza, altezza = excluded.altezza, byte = excluded.byte,
       pianta_id = excluded.pianta_id, nota_id = excluded.nota_id, archiviata = excluded.archiviata $$,
  'upsert di una foto senza creato_da nel payload: riesce');

-- ===== Vincoli =====
select throws_ok(
  $$ insert into note (id, esperimento_id, data, testo)
     values ('a5000000-0000-0000-0000-000000000009', 'e5000000-0000-0000-0000-000000000001', '2026-11-01', '   ') $$,
  '23514', null,
  'una nota con il testo vuoto (solo spazi) si rifiuta');

select throws_ok(
  $$ insert into note (id, esperimento_id, data, testo)
     values ('a5000000-0000-0000-0000-000000000009', 'e5000000-0000-0000-0000-000000000001', null, 'Senza data') $$,
  '23502', null,
  'una nota senza data si rifiuta');

select throws_ok(
  $$ insert into note_piante (nota_id, pianta_id, esperimento_id)
     values ('a5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000009', 'e5000000-0000-0000-0000-000000000001') $$,
  '23503', null,
  'una nota non si collega a una pianta di un altro esperimento');

select throws_ok(
  $$ insert into note_piante (nota_id, pianta_id, esperimento_id)
     values ('a5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000009', 'e5000000-0000-0000-0000-000000000002') $$,
  '23503', null,
  'nemmeno dichiarando l''esperimento della pianta: la nota e'' di un altro');

select throws_ok(
  $$ insert into note_trattamenti (nota_id, trattamento_id, esperimento_id)
     values ('a5000000-0000-0000-0000-000000000001', '75000000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-000000000001') $$,
  '23503', null,
  'una nota non si collega a un trattamento di un altro esperimento');

select throws_ok(
  $$ update foto set pianta_id = 'b5000000-0000-0000-0000-000000000009' where id = 'f5000000-0000-0000-0000-000000000002' $$,
  '23503', null,
  'una foto non si collega a una pianta di un altro esperimento');

select throws_ok(
  $$ update foto set nota_id = 'a5000000-0000-0000-0000-000000000002' where id = 'f5000000-0000-0000-0000-000000000002' $$,
  '23503', null,
  'una foto non si collega a una nota di un altro esperimento');

select throws_ok(
  $$ insert into foto (id, esperimento_id, data, percorso)
     values ('f5000000-0000-0000-0000-000000000009', 'e5000000-0000-0000-0000-000000000001', '2026-11-01',
             'e6000000-0000-0000-0000-000000000001/f5000000-0000-0000-0000-000000000009.jpg') $$,
  '23514', null,
  'il percorso di una foto e'' <esperimento_id>/<id>.jpg: non punta a un altro esperimento');

select throws_ok(
  $$ insert into foto (id, esperimento_id, data, percorso)
     values ('f5000000-0000-0000-0000-000000000009', 'e5000000-0000-0000-0000-000000000001', '2026-11-01',
             'e5000000-0000-0000-0000-000000000001/f5000000-0000-0000-0000-000000000001.jpg') $$,
  '23514', null,
  'ne'' al file di un''altra foto');

select throws_ok(
  $$ insert into foto (id, esperimento_id, data, percorso, byte)
     values ('f5000000-0000-0000-0000-000000000009', 'e5000000-0000-0000-0000-000000000001', '2026-11-01',
             'e5000000-0000-0000-0000-000000000001/f5000000-0000-0000-0000-000000000009.jpg', -1) $$,
  '23514', null,
  'byte, larghezza e altezza non sono negativi');

-- ===== creato_da =====
select throws_ok(
  $$ update note set creato_da = '0e000000-0000-0000-0000-00000000000b' where id = 'a5000000-0000-0000-0000-000000000001' $$,
  '42501', null,
  'creato_da di una nota non si modifica');

select throws_ok(
  $$ update foto set creato_da = '0e000000-0000-0000-0000-00000000000b' where id = 'f5000000-0000-0000-0000-000000000001' $$,
  '42501', null,
  'creato_da di una foto non si modifica');

select throws_ok(
  $$ insert into note (id, esperimento_id, data, testo, creato_da)
     values ('a5000000-0000-0000-0000-000000000008', 'e5000000-0000-0000-0000-000000000001', '2026-11-01', 'Firmata da B',
             '0e000000-0000-0000-0000-00000000000b') $$,
  '42501', null,
  'una nota non si firma a nome di un altro');

select throws_ok(
  $$ insert into foto (id, esperimento_id, data, percorso, creato_da)
     values ('f5000000-0000-0000-0000-000000000008', 'e5000000-0000-0000-0000-000000000001', '2026-11-01',
             'e5000000-0000-0000-0000-000000000001/f5000000-0000-0000-0000-000000000008.jpg', '0e000000-0000-0000-0000-00000000000b') $$,
  '42501', null,
  'una foto non si firma a nome di un altro');

-- ===== esperimento_id non si cambia (A e' membro di entrambi gli esperimenti) =====
select throws_ok(
  $$ update note set esperimento_id = 'e5000000-0000-0000-0000-000000000001' where id = 'a5000000-0000-0000-0000-000000000002' $$,
  'P0001', 'ESPERIMENTO_NON_MODIFICABILE',
  'una nota non cambia esperimento');

select throws_ok(
  $$ update note_piante set esperimento_id = 'e5000000-0000-0000-0000-000000000002' $$,
  'P0001', 'ESPERIMENTO_NON_MODIFICABILE',
  'un collegamento nota-pianta non cambia esperimento');

select throws_ok(
  $$ update note_trattamenti set esperimento_id = 'e5000000-0000-0000-0000-000000000002' $$,
  'P0001', 'ESPERIMENTO_NON_MODIFICABILE',
  'un collegamento nota-trattamento non cambia esperimento');

select throws_ok(
  $$ update foto set esperimento_id = 'e5000000-0000-0000-0000-000000000002' where id = 'f5000000-0000-0000-0000-000000000001' $$,
  'P0001', 'ESPERIMENTO_NON_MODIFICABILE',
  'una foto non cambia esperimento');

-- ===== Storage: A carica e legge i file del proprio esperimento =====
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('foto', 'e5000000-0000-0000-0000-000000000001/f5000000-0000-0000-0000-000000000001.jpg', auth.uid()),
            ('foto', 'e5000000-0000-0000-0000-000000000001/f5000000-0000-0000-0000-000000000002.jpg', auth.uid()) $$,
  'A carica i file delle foto nel proprio esperimento');

select is(
  (select count(*)::int from storage.objects),
  2,
  'A vede i suoi due file e non quello con il percorso estraneo (e la lettura non va in errore)');

-- Ogni percorso costruito ad arte e' rifiutato dalla policy (42501), non da un errore di cast.
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('foto', 'e6000000-0000-0000-0000-000000000001/f5000000-0000-0000-0000-000000000007.jpg', auth.uid()) $$,
  '42501', null,
  'Storage: A non carica nella cartella di un esperimento di cui non e'' membro');

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner) values ('foto', 'non-un-uuid/x.jpg', auth.uid()) $$,
  '42501', null,
  'Storage: un primo segmento che non e'' un uuid nega senza errori di cast');

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('foto', '../e5000000-0000-0000-0000-000000000001/f5000000-0000-0000-0000-000000000007.jpg', auth.uid()) $$,
  '42501', null,
  'Storage: un percorso che comincia con ../ e'' rifiutato');

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('foto', 'e5000000-0000-0000-0000-000000000001/../e6000000-0000-0000-0000-000000000001/f5000000-0000-0000-0000-000000000007.jpg', auth.uid()) $$,
  '42501', null,
  'Storage: un percorso che risale con /../ verso un altro esperimento e'' rifiutato');

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('foto', 'e5000000-0000-0000-0000-000000000001/sotto/f5000000-0000-0000-0000-000000000007.jpg', auth.uid()) $$,
  '42501', null,
  'Storage: niente sottocartelle');

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('foto', 'E5000000-0000-0000-0000-000000000001/f5000000-0000-0000-0000-000000000007.jpg', auth.uid()) $$,
  '42501', null,
  'Storage: solo uuid in minuscolo (un percorso, un file)');

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('foto', 'e5000000-0000-0000-0000-000000000001/f5000000-0000-0000-0000-000000000007.html', auth.uid()) $$,
  '42501', null,
  'Storage: solo file .jpg');

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('foto', 'e5000000-0000-0000-0000-000000000001/f5000000-0000-0000-0000-000000000007.jpg' || chr(10), auth.uid()) $$,
  '42501', null,
  'Storage: niente caratteri dopo .jpg (nemmeno un a capo)');

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('altro', 'e5000000-0000-0000-0000-000000000001/f5000000-0000-0000-0000-000000000007.jpg', auth.uid()) $$,
  '42501', null,
  'Storage: le policy valgono solo per il bucket foto');

select is_empty(
  $$ update storage.objects set name = 'e5000000-0000-0000-0000-000000000002/f5000000-0000-0000-0000-000000000001.jpg'
      returning id $$,
  'Storage: nessun file si sposta o si sovrascrive (nessuna policy di update)');

select is_empty(
  $$ delete from storage.objects where name = 'non-un-uuid/x.jpg' returning id $$,
  'Storage: il file con il percorso estraneo non si elimina (e non va in errore)');

select is(
  (select count(*)::int from storage.foldername('e5000000-0000-0000-0000-000000000001/f.jpg') as c (cartella)),
  1,
  'storage.foldername restituisce le cartelle senza il nome del file');

-- ===== B non vede e non tocca nulla di A =====
select set_config('request.jwt.claims',
  json_build_object('sub', '0e000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);

select is(
  array[(select count(*)::int from note), (select count(*)::int from note_piante),
        (select count(*)::int from note_trattamenti), (select count(*)::int from foto),
        (select count(*)::int from storage.objects)],
  array[0, 0, 0, 0, 0],
  'B vede 0 note, collegamenti, foto e file di A');

select is_empty(
  $$ update note set testo = 'x' returning id $$,
  'B: update delle note di A tocca 0 righe');

select is_empty(
  $$ delete from foto returning id $$,
  'B: delete delle foto di A tocca 0 righe');

select is_empty(
  $$ delete from note_piante returning nota_id $$,
  'B: delete dei collegamenti di A tocca 0 righe');

select is_empty(
  $$ delete from storage.objects returning id $$,
  'Storage: B non elimina i file di A');

select throws_ok(
  $$ insert into note (id, esperimento_id, data, testo)
     values ('a6000000-0000-0000-0000-000000000009', 'e5000000-0000-0000-0000-000000000001', '2026-11-01', 'Intrusa') $$,
  '42501', null,
  'B non scrive note nell''esperimento di A');

select throws_ok(
  $$ insert into foto (id, esperimento_id, data, percorso)
     values ('f6000000-0000-0000-0000-000000000009', 'e5000000-0000-0000-0000-000000000001', '2026-11-01',
             'e5000000-0000-0000-0000-000000000001/f6000000-0000-0000-0000-000000000009.jpg') $$,
  '42501', null,
  'B non scrive foto nell''esperimento di A');

select throws_ok(
  $$ insert into note_piante (nota_id, pianta_id, esperimento_id)
     values ('a5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'B non collega note di A');

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('foto', 'e5000000-0000-0000-0000-000000000001/f5000000-0000-0000-0000-000000000001.jpg', auth.uid()) $$,
  '42501', null,
  'Storage: B non carica nella cartella di A, nemmeno sul percorso di un file esistente');

select lives_ok(
  $$ insert into note (id, esperimento_id, data, testo)
     values ('a6000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000001', '2026-11-01', 'Nota di B') $$,
  'B scrive note nel proprio esperimento');

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('foto', 'e6000000-0000-0000-0000-000000000001/f6000000-0000-0000-0000-000000000001.jpg', auth.uid()) $$,
  'Storage: B carica file nel proprio esperimento');

select throws_ok(
  $$ insert into note_piante (nota_id, pianta_id, esperimento_id)
     values ('a6000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000001') $$,
  '23503', null,
  'B non collega la propria nota a una pianta di A');

select is(
  (select count(*)::int from storage.objects),
  1,
  'Storage: B vede solo il proprio file');

-- ===== Di nuovo A: eliminazioni =====
select set_config('request.jwt.claims',
  json_build_object('sub', '0e000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::int from storage.objects),
  2,
  'Storage: A non vede il file di B');

select throws_ok(
  $$ delete from piante where id = 'b5000000-0000-0000-0000-000000000001' $$,
  '23503', null,
  'una pianta con note collegate non si elimina');

select throws_ok(
  $$ delete from piante where id = 'b5000000-0000-0000-0000-000000000002' $$,
  '23503', null,
  'una pianta con foto non si elimina');

select throws_ok(
  $$ delete from trattamenti where id = '75000000-0000-0000-0000-000000000003' $$,
  '23503', null,
  'un trattamento senza piante ma con note collegate non si elimina');

select isnt_empty(
  $$ delete from note where id = 'a5000000-0000-0000-0000-000000000001' returning id $$,
  'A elimina la nota con un collegamento e una foto');

select results_eq(
  $$ select (select count(*)::int from note_piante where nota_id = 'a5000000-0000-0000-0000-000000000001'),
            (select count(*)::int from foto where id = 'f5000000-0000-0000-0000-000000000001'),
            (select count(*)::int from foto where id = 'f5000000-0000-0000-0000-000000000001' and nota_id is null) $$,
  $$ values (0, 1, 1) $$,
  'eliminare una nota toglie i collegamenti e lascia la foto senza nota');

select isnt_empty(
  $$ delete from piante where id = 'b5000000-0000-0000-0000-000000000001' returning id $$,
  'la pianta senza note ne'' foto si elimina');

select isnt_empty(
  $$ delete from storage.objects
      where bucket_id = 'foto' and name = 'e5000000-0000-0000-0000-000000000001/f5000000-0000-0000-0000-000000000002.jpg'
      returning id $$,
  'Storage: A elimina un file del proprio esperimento');

select lives_ok(
  $$ delete from esperimenti where id = 'e5000000-0000-0000-0000-000000000001' $$,
  'A elimina l''esperimento con note, collegamenti e foto');

reset role;
select is(
  (select count(*)::int from (
     select 1 from note where esperimento_id = 'e5000000-0000-0000-0000-000000000001'
     union all select 1 from note_piante where esperimento_id = 'e5000000-0000-0000-0000-000000000001'
     union all select 1 from note_trattamenti where esperimento_id = 'e5000000-0000-0000-0000-000000000001'
     union all select 1 from foto where esperimento_id = 'e5000000-0000-0000-0000-000000000001'
   ) x),
  0,
  'l''eliminazione dell''esperimento va a cascata su note, collegamenti e foto');

-- ===== anon: nessun accesso =====
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

select throws_ok($$ select count(*) from note $$, '42501', null, 'anon non legge le note');
select throws_ok($$ select count(*) from foto $$, '42501', null, 'anon non legge le foto');

select is(
  (select count(*)::int from storage.objects),
  0,
  'Storage: anon non vede nessun file');

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('foto', 'e6000000-0000-0000-0000-000000000001/f6000000-0000-0000-0000-000000000002.jpg') $$,
  '42501', null,
  'Storage: anon non carica file');

reset role;
select * from finish();
rollback;
