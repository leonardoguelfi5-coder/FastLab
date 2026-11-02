begin;
create extension if not exists pgtap with schema extensions;
select plan(95);

-- ===== Casi di prova di scelte_export_valide =====
-- Sono anche i casi di prova di leggiSceltaExport (src/domain/export/scelte.ts, Task D6): le due
-- funzioni devono dare la stessa risposta su ciascuno. Ogni caso ha un nome, le scelte e se e'
-- valido. Quelli con migliaia di ids si generano piu' sotto (ids al limite, troppi ids, enorme).
-- La forma di base (valida) e':
--   {"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"}, "periodo": {"modo": "tutto"},
--    "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}
create temporary table casi (nome text primary key, scelte jsonb, valida boolean not null);

insert into casi (nome, valida, scelte) values
  -- Valide
  ('tutto l''esperimento', true,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"}, "periodo": {"modo": "tutto"},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('strumenti scelti', true,
   '{"v": 1, "strumenti": {"modo": "scelti", "ids": ["d5000000-0000-0000-0000-000000000001", "d5000000-0000-0000-0000-000000000002"]},
     "piante": {"modo": "tutte"}, "periodo": {"modo": "tutto"},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('piante per trattamenti', true,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "trattamenti", "ids": ["75000000-0000-0000-0000-000000000001"]},
     "periodo": {"modo": "tutto"}, "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('piante scelte', true,
   '{"v": 1, "strumenti": {"modo": "tutti"},
     "piante": {"modo": "piante", "ids": ["b5000000-0000-0000-0000-000000000001", "b5000000-0000-0000-0000-00000000000a"]},
     "periodo": {"modo": "tutto"}, "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('ultime 4 settimane', true,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"}, "periodo": {"modo": "settimane", "n": 4},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('ultima settimana (n = 1)', true,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"}, "periodo": {"modo": "settimane", "n": 1},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('ultime 104 settimane (n = 104)', true,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"}, "periodo": {"modo": "settimane", "n": 104},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('intervallo', true,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"},
     "periodo": {"modo": "intervallo", "da": "2026-10-06", "a": "2026-11-02"},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('intervallo di un giorno (da = a)', true,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"},
     "periodo": {"modo": "intervallo", "da": "2026-11-02", "a": "2026-11-02"},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('intervallo con il 29 febbraio di un anno bisestile', true,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"},
     "periodo": {"modo": "intervallo", "da": "2028-02-29", "a": "2028-03-01"},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('solo i valori', true,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"}, "periodo": {"modo": "tutto"},
     "come": {"valori": true, "medie": false, "grafici": false, "diario": false, "info": false}}'),
  -- Sbagliate
  ('chiave in piu''', false,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"}, "periodo": {"modo": "tutto"},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}, "nome": "x"}'),
  ('chiave mancante (come)', false,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"}, "periodo": {"modo": "tutto"}}'),
  ('chiave in piu'' dentro strumenti (ids con tutti)', false,
   '{"v": 1, "strumenti": {"modo": "tutti", "ids": ["d5000000-0000-0000-0000-000000000001"]},
     "piante": {"modo": "tutte"}, "periodo": {"modo": "tutto"},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('chiave mancante dentro periodo (a)', false,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"}, "periodo": {"modo": "intervallo", "da": "2026-10-06"},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('v = 2', false,
   '{"v": 2, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"}, "periodo": {"modo": "tutto"},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('v come testo', false,
   '{"v": "1", "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"}, "periodo": {"modo": "tutto"},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('modo sconosciuto (periodo mese)', false,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"}, "periodo": {"modo": "mese"},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('modo delle piante usato per gli strumenti (tutte)', false,
   '{"v": 1, "strumenti": {"modo": "tutte"}, "piante": {"modo": "tutte"}, "periodo": {"modo": "tutto"},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('ids vuoto', false,
   '{"v": 1, "strumenti": {"modo": "scelti", "ids": []}, "piante": {"modo": "tutte"}, "periodo": {"modo": "tutto"},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('ids non e'' un array', false,
   '{"v": 1, "strumenti": {"modo": "scelti", "ids": "d5000000-0000-0000-0000-000000000001"}, "piante": {"modo": "tutte"},
     "periodo": {"modo": "tutto"}, "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('uuid non valido', false,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "piante", "ids": ["non-un-uuid"]}, "periodo": {"modo": "tutto"},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('uuid maiuscolo', false,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "piante", "ids": ["B5000000-0000-0000-0000-00000000000A"]},
     "periodo": {"modo": "tutto"}, "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('uuid seguito da un a capo', false,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "piante", "ids": ["b5000000-0000-0000-0000-000000000001\n"]},
     "periodo": {"modo": "tutto"}, "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('id che non e'' una stringa', false,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "trattamenti", "ids": [1]}, "periodo": {"modo": "tutto"},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('doppione', false,
   '{"v": 1, "strumenti": {"modo": "tutti"},
     "piante": {"modo": "piante", "ids": ["b5000000-0000-0000-0000-000000000001", "b5000000-0000-0000-0000-000000000001"]},
     "periodo": {"modo": "tutto"}, "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('n = 0', false,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"}, "periodo": {"modo": "settimane", "n": 0},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('n = 105', false,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"}, "periodo": {"modo": "settimane", "n": 105},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('n = 4,5', false,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"}, "periodo": {"modo": "settimane", "n": 4.5},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('n come testo', false,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"}, "periodo": {"modo": "settimane", "n": "4"},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('data impossibile (2026-02-30)', false,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"},
     "periodo": {"modo": "intervallo", "da": "2026-02-30", "a": "2026-03-10"},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('29 febbraio di un anno non bisestile', false,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"},
     "periodo": {"modo": "intervallo", "da": "2026-02-01", "a": "2026-02-29"},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('data in un altro formato (06/10/2026)', false,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"},
     "periodo": {"modo": "intervallo", "da": "06/10/2026", "a": "2026-11-02"},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('anno zero (0000-01-01)', false,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"},
     "periodo": {"modo": "intervallo", "da": "0000-01-01", "a": "2026-11-02"},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('da dopo a', false,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"},
     "periodo": {"modo": "intervallo", "da": "2026-11-02", "a": "2026-11-01"},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('come tutto falso', false,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"}, "periodo": {"modo": "tutto"},
     "come": {"valori": false, "medie": false, "grafici": false, "diario": false, "info": false}}'),
  ('come con un valore non booleano', false,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"}, "periodo": {"modo": "tutto"},
     "come": {"valori": "sì", "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('come con una chiave mancante (info)', false,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"}, "periodo": {"modo": "tutto"},
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true}}'),
  ('periodo che non e'' un oggetto', false,
   '{"v": 1, "strumenti": {"modo": "tutti"}, "piante": {"modo": "tutte"}, "periodo": "tutto",
     "come": {"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}}'),
  ('un array al posto dell''oggetto', false, '[]'),
  ('il null di JSON', false, 'null');

-- I casi generati: 200 strumenti e 2000 piante sono il massimo, uno in piu' no; un oggetto
-- enorme (oltre 100 000 byte) e' sbagliato senza essere letto tutto.
create function pg_temp.ids(prefisso text, quanti int) returns jsonb language sql as $$
  select jsonb_agg(prefisso || lpad(to_hex(i), 12, '0') order by i) from generate_series(1, quanti) i
$$;

insert into casi (nome, valida, scelte) values
  ('ids al limite (200 strumenti, 2000 piante)', true,
   jsonb_build_object('v', 1,
     'strumenti', jsonb_build_object('modo', 'scelti', 'ids', pg_temp.ids('d5000000-0000-0000-0000-', 200)),
     'piante', jsonb_build_object('modo', 'piante', 'ids', pg_temp.ids('b5000000-0000-0000-0000-', 2000)),
     'periodo', '{"modo": "tutto"}'::jsonb,
     'come', '{"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}'::jsonb)),
  ('troppi strumenti (201)', false,
   jsonb_build_object('v', 1,
     'strumenti', jsonb_build_object('modo', 'scelti', 'ids', pg_temp.ids('d5000000-0000-0000-0000-', 201)),
     'piante', '{"modo": "tutte"}'::jsonb, 'periodo', '{"modo": "tutto"}'::jsonb,
     'come', '{"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}'::jsonb)),
  ('troppe piante (2001)', false,
   jsonb_build_object('v', 1, 'strumenti', '{"modo": "tutti"}'::jsonb,
     'piante', jsonb_build_object('modo', 'trattamenti', 'ids', pg_temp.ids('75000000-0000-0000-0000-', 2001)),
     'periodo', '{"modo": "tutto"}'::jsonb,
     'come', '{"valori": true, "medie": true, "grafici": true, "diario": true, "info": true}'::jsonb)),
  ('enorme (oltre 100 000 byte)', false,
   jsonb_build_object('v', 1, 'strumenti', '{"modo": "tutti"}'::jsonb, 'piante', '{"modo": "tutte"}'::jsonb,
     'periodo', '{"modo": "tutto"}'::jsonb,
     'come', jsonb_build_object('valori', true, 'medie', true, 'grafici', true, 'diario', true, 'info', repeat('x', 200000))));

grant select on casi to authenticated;

-- Fixture (superuser): A e' proprietario di EA e di EA2, C collabora in EA (e alla fine si
-- elimina), B ha EB e non e' membro di EA.
insert into inviti (email, codice) values
  ('a.export@test.it', 'CODICED1'), ('b.export@test.it', 'CODICED2'), ('c.export@test.it', 'CODICED3');
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('0d000000-0000-0000-0000-00000000000a', 'a.export@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'CODICED1')),
  ('0d000000-0000-0000-0000-00000000000b', 'b.export@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'CODICED2')),
  ('0d000000-0000-0000-0000-00000000000c', 'c.export@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'CODICED3'));

insert into esperimenti (id, nome, creato_da) values
  ('ed000000-0000-0000-0000-000000000001', 'EA', '0d000000-0000-0000-0000-00000000000a'),
  ('ed000000-0000-0000-0000-000000000002', 'EA2', '0d000000-0000-0000-0000-00000000000a'),
  ('ed000000-0000-0000-0000-00000000000b', 'EB', '0d000000-0000-0000-0000-00000000000b');

insert into membri_esperimento (esperimento_id, utente_id, ruolo) values
  ('ed000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-00000000000c', 'collaboratore');

-- ===== Struttura =====
select has_table('public', 'export_salvati', 'la tabella export_salvati esiste');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.export_salvati'::regclass),
  'export_salvati ha la RLS attiva');

select is_empty(
  $$ select policyname from pg_policies
      where schemaname = 'public' and tablename = 'export_salvati'
        and not (roles @> array['authenticated']::name[] and cardinality(roles) = 1) $$,
  'le policy di export_salvati sono solo per authenticated');

select results_eq(
  $$ select cmd::text from pg_policies where schemaname = 'public' and tablename = 'export_salvati' order by 1 $$,
  $$ values ('DELETE'), ('INSERT'), ('SELECT'), ('UPDATE') $$,
  'una policy per operazione: select, insert, update, delete');

select has_trigger('public', 'export_salvati', 'export_salvati_aggiornato_il', 'export_salvati ha il trigger di aggiornato_il');
select has_trigger('public', 'export_salvati', 'guardia_esperimento_id', 'export_salvati ha la guardia di esperimento_id');

select has_index('public', 'export_salvati', 'export_salvati_nome_unico', 'c''e'' l''indice unico del nome');

select has_index('public', 'misure', 'misure_esperimento_strumento_id_idx',
  array['esperimento_id', 'strumento_id', 'id'],
  'misure ha l''indice (esperimento_id, strumento_id, id) per le pagine keyset');

select is(
  (select p.provolatile::text || ' ' || array_to_string(p.proconfig, ',') from pg_proc p
    where p.oid = 'public.scelte_export_valide(jsonb)'::regprocedure),
  'i search_path=""',
  'scelte_export_valide e'' immutable e con search_path vuoto');

-- ===== scelte_export_valide: tutti i casi, senza mai andare in errore =====
select is_empty(
  $$ select nome from casi where public.scelte_export_valide(scelte) is distinct from valida $$,
  'scelte_export_valide da'' la risposta attesa su ogni caso di prova');

select is(public.scelte_export_valide(null), false, 'scelte_export_valide(null) e'' false, non null');

select is(
  public.scelte_export_valide(jsonb_build_object('v', 1, 'x', repeat('y', 2000000))),
  false,
  'un oggetto di 2 MB e'' false senza errori');

-- ===== A: crea, legge, rinomina ed elimina i suoi export =====
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '0d000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ insert into export_salvati (id, esperimento_id, nome, scelte)
     values ('e1000000-0000-0000-0000-000000000001', 'ed000000-0000-0000-0000-000000000001', 'Settimanale',
             (select scelte from casi where nome = 'ultime 4 settimane')) $$,
  'A salva un export in EA');

select results_eq(
  $$ select creato_da, creato_il is not null, aggiornato_il is not null
       from export_salvati where id = 'e1000000-0000-0000-0000-000000000001' $$,
  $$ values ('0d000000-0000-0000-0000-00000000000a'::uuid, true, true) $$,
  'l''export e'' firmato da chi lo salva, con le date');

select lives_ok(
  $$ insert into export_salvati (id, esperimento_id, nome, scelte)
     values ('e1000000-0000-0000-0000-000000000001', 'ed000000-0000-0000-0000-000000000001', 'Settimanale',
             (select scelte from casi where nome = 'solo i valori'))
     on conflict (id) do update set
       id = excluded.id, esperimento_id = excluded.esperimento_id, nome = excluded.nome, scelte = excluded.scelte $$,
  'upsert di un export senza creato_da nel payload: riesce');

select is(
  (select scelte -> 'come' ->> 'medie' from export_salvati where id = 'e1000000-0000-0000-0000-000000000001'),
  'false',
  'l''upsert ha sostituito le scelte');

select isnt_empty(
  $$ update export_salvati set nome = 'Ogni settimana' where id = 'e1000000-0000-0000-0000-000000000001' returning id $$,
  'A rinomina il suo export');

select lives_ok(
  $$ insert into export_salvati (id, esperimento_id, nome, scelte)
     values ('e1000000-0000-0000-0000-000000000002', 'ed000000-0000-0000-0000-000000000001', 'Da eliminare',
             (select scelte from casi where nome = 'tutto l''esperimento')),
            ('e1000000-0000-0000-0000-000000000003', 'ed000000-0000-0000-0000-000000000002', 'Ogni settimana',
             (select scelte from casi where nome = 'tutto l''esperimento')),
            ('e1000000-0000-0000-0000-000000000004', 'ed000000-0000-0000-0000-000000000001', repeat('n', 80),
             (select scelte from casi where nome = 'ids al limite (200 strumenti, 2000 piante)')) $$,
  'A salva altri export: lo stesso nome in un altro esperimento, un nome di 80 caratteri, le scelte al limite');

select isnt_empty(
  $$ delete from export_salvati where id = 'e1000000-0000-0000-0000-000000000002' returning id $$,
  'A elimina un suo export');

select is(
  (select count(*)::int from export_salvati),
  3,
  'A vede i suoi tre export');

-- Ogni caso valido si salva, ogni caso sbagliato si rifiuta con il vincolo (23514).
select lives_ok(
  format($$ insert into export_salvati (id, esperimento_id, nome, scelte)
            values (%L, 'ed000000-0000-0000-0000-000000000002', %L, %L) $$,
         md5(nome)::uuid, 'Caso: ' || left(nome, 60), scelte),
  'scelte valide: ' || nome)
  from casi where valida order by nome;

select throws_ok(
  format($$ insert into export_salvati (id, esperimento_id, nome, scelte)
            values (%L, 'ed000000-0000-0000-0000-000000000002', %L, %L) $$,
         md5(nome)::uuid, 'Caso: ' || left(nome, 60), scelte),
  '23514', null,
  'scelte sbagliate: ' || nome)
  from casi where not valida order by nome;

select throws_ok(
  $$ update export_salvati set scelte = (select scelte from casi where nome = 'come tutto falso')
      where id = 'e1000000-0000-0000-0000-000000000001' $$,
  '23514', null,
  'nemmeno un update mette scelte sbagliate');

-- ===== Vincoli sul nome =====
select throws_ok(
  $$ insert into export_salvati (id, esperimento_id, nome, scelte)
     values ('e1000000-0000-0000-0000-000000000009', 'ed000000-0000-0000-0000-000000000001', '',
             (select scelte from casi where nome = 'tutto l''esperimento')) $$,
  '23514', null,
  'un nome vuoto si rifiuta');

select throws_ok(
  $$ insert into export_salvati (id, esperimento_id, nome, scelte)
     values ('e1000000-0000-0000-0000-000000000009', 'ed000000-0000-0000-0000-000000000001', '   ',
             (select scelte from casi where nome = 'tutto l''esperimento')) $$,
  '23514', null,
  'un nome di soli spazi si rifiuta');

select throws_ok(
  $$ insert into export_salvati (id, esperimento_id, nome, scelte)
     values ('e1000000-0000-0000-0000-000000000009', 'ed000000-0000-0000-0000-000000000001', repeat('n', 81),
             (select scelte from casi where nome = 'tutto l''esperimento')) $$,
  '23514', null,
  'un nome di 81 caratteri si rifiuta');

select throws_ok(
  $$ insert into export_salvati (id, esperimento_id, nome, scelte)
     values ('e1000000-0000-0000-0000-000000000009', 'ed000000-0000-0000-0000-000000000001', null,
             (select scelte from casi where nome = 'tutto l''esperimento')) $$,
  '23502', null,
  'un export senza nome si rifiuta');

select throws_ok(
  $$ insert into export_salvati (id, esperimento_id, nome, scelte)
     values ('e1000000-0000-0000-0000-000000000009', 'ed000000-0000-0000-0000-000000000001', 'Senza scelte', null) $$,
  '23502', null,
  'un export senza scelte si rifiuta');

select throws_ok(
  $$ insert into export_salvati (id, esperimento_id, nome, scelte)
     values ('e1000000-0000-0000-0000-000000000009', 'ed000000-0000-0000-0000-000000000001', '  OGNI settimana ',
             (select scelte from casi where nome = 'tutto l''esperimento')) $$,
  '23505', null,
  'lo stesso nome con maiuscole e spazi diversi, per lo stesso utente e lo stesso esperimento, si rifiuta');

select throws_ok(
  $$ update export_salvati set nome = 'ogni settimana' where id = 'e1000000-0000-0000-0000-000000000004' $$,
  '23505', null,
  'nemmeno rinominando si prende il nome di un altro export dello stesso utente');

-- ===== creato_da ed esperimento_id =====
select throws_ok(
  $$ update export_salvati set creato_da = '0d000000-0000-0000-0000-00000000000c'
      where id = 'e1000000-0000-0000-0000-000000000001' $$,
  '42501', null,
  'creato_da di un export non si modifica');

select throws_ok(
  $$ update export_salvati set creato_il = now() - interval '1 day'
      where id = 'e1000000-0000-0000-0000-000000000001' $$,
  '42501', null,
  'creato_il di un export non si modifica');

select throws_ok(
  $$ update export_salvati set esperimento_id = 'ed000000-0000-0000-0000-000000000002'
      where id = 'e1000000-0000-0000-0000-000000000001' $$,
  'P0001', 'ESPERIMENTO_NON_MODIFICABILE',
  'un export non cambia esperimento (A e'' membro di entrambi)');

select throws_ok(
  $$ insert into export_salvati (id, esperimento_id, nome, scelte, creato_da)
     values ('e1000000-0000-0000-0000-000000000009', 'ed000000-0000-0000-0000-000000000001', 'Per C',
             (select scelte from casi where nome = 'tutto l''esperimento'), '0d000000-0000-0000-0000-00000000000c') $$,
  '42501', null,
  'A non salva un export a nome di C, che e'' membro dello stesso esperimento');

-- ===== C, membro dello stesso esperimento: non vede e non tocca gli export di A =====
select set_config('request.jwt.claims',
  json_build_object('sub', '0d000000-0000-0000-0000-00000000000c', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::int from export_salvati),
  0,
  'C non vede gli export di A');

select is_empty(
  $$ update export_salvati set nome = 'Preso' returning id $$,
  'C: update degli export di A tocca 0 righe');

select is_empty(
  $$ delete from export_salvati returning id $$,
  'C: delete degli export di A tocca 0 righe');

select throws_ok(
  $$ insert into export_salvati (id, esperimento_id, nome, scelte)
     values ('e1000000-0000-0000-0000-000000000001', 'ed000000-0000-0000-0000-000000000001', 'Preso',
             (select scelte from casi where nome = 'tutto l''esperimento'))
     on conflict (id) do update set nome = excluded.nome, scelte = excluded.scelte $$,
  '42501', null,
  'C: upsert con l''id di un export di A rifiutato');

select throws_ok(
  $$ insert into export_salvati (id, esperimento_id, nome, scelte, creato_da)
     values ('e1000000-0000-0000-0000-000000000009', 'ed000000-0000-0000-0000-000000000001', 'Per A',
             (select scelte from casi where nome = 'tutto l''esperimento'), '0d000000-0000-0000-0000-00000000000a') $$,
  '42501', null,
  'C non salva un export a nome di A');

select lives_ok(
  $$ insert into export_salvati (id, esperimento_id, nome, scelte)
     values ('e1000000-0000-0000-0000-00000000000c', 'ed000000-0000-0000-0000-000000000001', 'Ogni settimana',
             (select scelte from casi where nome = 'tutto l''esperimento')) $$,
  'C salva un export con lo stesso nome di uno di A: ammesso');

select results_eq(
  $$ select id, creato_da from export_salvati $$,
  $$ values ('e1000000-0000-0000-0000-00000000000c'::uuid, '0d000000-0000-0000-0000-00000000000c'::uuid) $$,
  'C vede solo il suo export');

select throws_ok(
  $$ insert into export_salvati (id, esperimento_id, nome, scelte)
     values ('e1000000-0000-0000-0000-00000000000d', 'ed000000-0000-0000-0000-000000000002', 'In EA2',
             (select scelte from casi where nome = 'tutto l''esperimento')) $$,
  '42501', null,
  'C non salva export in EA2, di cui non e'' membro');

-- ===== B, non membro: niente in EA =====
select set_config('request.jwt.claims',
  json_build_object('sub', '0d000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::int from export_salvati),
  0,
  'B non vede nessun export di EA ne'' di EA2');

select throws_ok(
  $$ insert into export_salvati (id, esperimento_id, nome, scelte)
     values ('e1000000-0000-0000-0000-00000000000b', 'ed000000-0000-0000-0000-000000000001', 'Intruso',
             (select scelte from casi where nome = 'tutto l''esperimento')) $$,
  '42501', null,
  'B non salva export in EA, di cui non e'' membro');

select lives_ok(
  $$ insert into export_salvati (id, esperimento_id, nome, scelte)
     values ('e1000000-0000-0000-0000-00000000000b', 'ed000000-0000-0000-0000-00000000000b', 'Ogni settimana',
             (select scelte from casi where nome = 'tutto l''esperimento')) $$,
  'B salva export nel proprio esperimento');

-- ===== Di nuovo A: non vede l'export di C =====
select set_config('request.jwt.claims',
  json_build_object('sub', '0d000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::int from export_salvati where id in ('e1000000-0000-0000-0000-00000000000c', 'e1000000-0000-0000-0000-00000000000b')),
  0,
  'A non vede gli export di C ne'' quelli di B');

-- ===== Eliminazioni a cascata =====
reset role;
-- Un utente si elimina solo dopo aver lasciato gli esperimenti (membri_esperimento non va a cascata):
-- con lui spariscono i suoi export, non quelli degli altri.
delete from membri_esperimento where utente_id = '0d000000-0000-0000-0000-00000000000c';
delete from auth.users where id = '0d000000-0000-0000-0000-00000000000c';

select results_eq(
  $$ select (select count(*)::int from export_salvati where creato_da = '0d000000-0000-0000-0000-00000000000c'),
            (select count(*)::int from export_salvati where id = 'e1000000-0000-0000-0000-000000000001') $$,
  $$ values (0, 1) $$,
  'eliminando un utente spariscono i suoi export e restano quelli degli altri');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '0d000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ delete from esperimenti where id = 'ed000000-0000-0000-0000-000000000001' $$,
  'A elimina EA con i suoi export');

reset role;
select results_eq(
  $$ select (select count(*)::int from export_salvati where esperimento_id = 'ed000000-0000-0000-0000-000000000001'),
            (select count(*)::int from export_salvati where esperimento_id = 'ed000000-0000-0000-0000-000000000002') > 0 $$,
  $$ values (0, true) $$,
  'eliminando l''esperimento spariscono i suoi export e restano quelli degli altri esperimenti');

-- ===== anon: nessun accesso =====
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

select throws_ok($$ select count(*) from export_salvati $$, '42501', null, 'anon non legge gli export salvati');

select throws_ok(
  $$ insert into export_salvati (id, esperimento_id, nome, scelte)
     values ('e1000000-0000-0000-0000-0000000000ff', 'ed000000-0000-0000-0000-00000000000b', 'Anonimo', '{}') $$,
  '42501', null,
  'anon non salva export');

select throws_ok(
  $$ select public.scelte_export_valide('{}'::jsonb) $$,
  '42501', null,
  'anon non esegue scelte_export_valide');

reset role;
select * from finish();
rollback;
