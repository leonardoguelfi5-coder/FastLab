begin;
create extension if not exists pgtap with schema extensions;
select plan(137);

-- Ruoli dell'esperimento (Piano E, Task E9): proprietario, rilevatore, lettore, e un estraneo.
-- Decisione dell'utente del 09/11: il rilevatore crea misure, note e foto, ma corregge ed elimina solo le
-- proprie; il proprietario corregge ed elimina tutto e da solo cambia la configurazione; il lettore legge.
--
-- Fixture (superuser): l'esperimento E di P, con R rilevatore e L lettore. X non e' membro. Ognuno dei quattro
-- ha in E una misura, una nota (collegata alla pianta 1 e al trattamento T1) e una foto con il suo file: L le ha
-- scritte quando era rilevatore, X quando era membro (poi tolto). Cosi' "le proprie" esiste per tutti.

-- ===== Utenti =====
insert into inviti (email, codice) values
  ('p.ruoli@test.it', 'RUOLIP01'), ('r.ruoli@test.it', 'RUOLIR01'), ('l.ruoli@test.it', 'RUOLIL01'),
  ('x.ruoli@test.it', 'RUOLIX01'), ('p2.ruoli@test.it', 'RUOLIP02'), ('nuovo.ruoli@test.it', 'RUOLIN01');
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('09000000-0000-0000-0000-00000000000a', 'p.ruoli@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'RUOLIP01')),
  ('09000000-0000-0000-0000-00000000000b', 'r.ruoli@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'RUOLIR01')),
  ('09000000-0000-0000-0000-00000000000c', 'l.ruoli@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'RUOLIL01')),
  ('09000000-0000-0000-0000-00000000000d', 'x.ruoli@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'RUOLIX01')),
  ('09000000-0000-0000-0000-00000000000e', 'p2.ruoli@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'RUOLIP02')),
  ('09000000-0000-0000-0000-00000000000f', 'nuovo.ruoli@test.it', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', jsonb_build_object('codice_invito', 'RUOLIN01'));

-- ===== Esperimento E e configurazione =====
-- F2, L2, T2, la pianta 2, PC, S2 e i loro collegamenti non hanno dati: il proprietario li puo' eliminare.
insert into esperimenti (id, nome, creato_da) values
  ('e9000000-0000-0000-0000-000000000001', 'E ruoli', '09000000-0000-0000-0000-00000000000a');
insert into membri_esperimento (esperimento_id, utente_id, ruolo) values
  ('e9000000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-00000000000b', 'rilevatore'),
  ('e9000000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-00000000000c', 'lettore');

insert into fattori (id, esperimento_id, nome, ordine) values
  ('f9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-000000000001', 'Dose', 0),
  ('f9000000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-000000000001', 'Vuoto', 1);
insert into livelli (id, esperimento_id, fattore_id, nome, ordine) values
  ('19000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000001', 'Alta', 0),
  ('19000000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000001', 'Bassa', 1);
insert into trattamenti (id, esperimento_id, etichetta, ordine) values
  ('79000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-000000000001', 'T1', 0),
  ('79000000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-000000000001', 'T2', 1);
insert into trattamento_livelli (esperimento_id, trattamento_id, livello_id) values
  ('e9000000-0000-0000-0000-000000000001', '79000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001');
insert into piante (id, esperimento_id, trattamento_id, etichetta, ordine) values
  ('b9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-000000000001', '79000000-0000-0000-0000-000000000001', '1', 0),
  ('b9000000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-000000000001', '79000000-0000-0000-0000-000000000001', '2', 1);
insert into parametri (id, esperimento_id, nome, tipo, ordine) values
  ('c9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-000000000001', 'SPAD', 'numero', 0),
  ('c9000000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-000000000001', 'Altezza', 'numero', 1),
  ('c9000000-0000-0000-0000-000000000003', 'e9000000-0000-0000-0000-000000000001', 'Libero', 'numero', 2);
insert into strumenti (id, esperimento_id, nome, ordine) values
  ('d9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-000000000001', 'SPAD', 0),
  ('d9000000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-000000000001', 'Metro', 1);
insert into strumento_parametri (esperimento_id, strumento_id, parametro_id, ordine) values
  ('e9000000-0000-0000-0000-000000000001', 'd9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001', 0),
  ('e9000000-0000-0000-0000-000000000001', 'd9000000-0000-0000-0000-000000000002', 'c9000000-0000-0000-0000-000000000002', 0);

-- ===== Misure, note, collegamenti e foto di ognuno =====
insert into misure (id, esperimento_id, pianta_id, strumento_id, data_rilievo, ora, valori, creato_da)
select ('a9000000-0000-0000-0000-00000000000' || s)::uuid, 'e9000000-0000-0000-0000-000000000001',
       'b9000000-0000-0000-0000-000000000001', 'd9000000-0000-0000-0000-000000000001', '2026-11-08', '09:00',
       '{"c9000000-0000-0000-0000-000000000001": [40]}', ('09000000-0000-0000-0000-00000000000' || s)::uuid
  from unnest(array['a', 'b', 'c', 'd']) as s;

insert into note (id, esperimento_id, data, testo, creato_da)
select ('a8000000-0000-0000-0000-00000000000' || s)::uuid, 'e9000000-0000-0000-0000-000000000001', '2026-11-08',
       'Nota di ' || s, ('09000000-0000-0000-0000-00000000000' || s)::uuid
  from unnest(array['a', 'b', 'c', 'd']) as s;
insert into note_piante (nota_id, pianta_id, esperimento_id)
select ('a8000000-0000-0000-0000-00000000000' || s)::uuid, 'b9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-000000000001'
  from unnest(array['a', 'b', 'c', 'd']) as s;
insert into note_trattamenti (nota_id, trattamento_id, esperimento_id)
select ('a8000000-0000-0000-0000-00000000000' || s)::uuid, '79000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-000000000001'
  from unnest(array['a', 'b', 'c', 'd']) as s;

-- Foto: una con il file per ognuno; poi FA (di P, archiviata: il file non c'e' piu'), FRnf (di R, il file non e'
-- ancora arrivato), FPR (la riga e' di P, il file l'ha caricato R) e FRP (la riga e' di R, il file l'ha caricato P:
-- per esempio R ha scritto per primo una riga con l'id di un file senza riga di P).
insert into foto (id, esperimento_id, data, percorso, creato_da, archiviata, archiviata_il)
select f.id::uuid, 'e9000000-0000-0000-0000-000000000001', '2026-11-08',
       'e9000000-0000-0000-0000-000000000001/' || f.id || '.jpg', f.autore::uuid, f.archiviata,
       case when f.archiviata then now() end
  from (values
    ('f8000000-0000-0000-0000-00000000000a', '09000000-0000-0000-0000-00000000000a', false),
    ('f8000000-0000-0000-0000-00000000000b', '09000000-0000-0000-0000-00000000000b', false),
    ('f8000000-0000-0000-0000-00000000000c', '09000000-0000-0000-0000-00000000000c', false),
    ('f8000000-0000-0000-0000-00000000000d', '09000000-0000-0000-0000-00000000000d', false),
    ('f8000000-0000-0000-0000-00000000001a', '09000000-0000-0000-0000-00000000000a', true),
    ('f8000000-0000-0000-0000-00000000001b', '09000000-0000-0000-0000-00000000000b', false),
    ('f8000000-0000-0000-0000-00000000002a', '09000000-0000-0000-0000-00000000000a', false),
    ('f8000000-0000-0000-0000-00000000002b', '09000000-0000-0000-0000-00000000000b', false)
  ) as f (id, autore, archiviata);

-- I file: owner e' chi li ha caricati (lo scrive il servizio Storage). SP, SR, SL, SX sono file senza riga (un
-- caricamento la cui riga non e' arrivata); S0 non ha nemmeno chi l'ha caricato (dal Dashboard).
insert into storage.objects (bucket_id, name, owner)
select 'foto', 'e9000000-0000-0000-0000-000000000001/' || o.id || '.jpg', o.owner::uuid
  from (values
    ('f8000000-0000-0000-0000-00000000000a', '09000000-0000-0000-0000-00000000000a'),
    ('f8000000-0000-0000-0000-00000000000b', '09000000-0000-0000-0000-00000000000b'),
    ('f8000000-0000-0000-0000-00000000000c', '09000000-0000-0000-0000-00000000000c'),
    ('f8000000-0000-0000-0000-00000000000d', '09000000-0000-0000-0000-00000000000d'),
    ('f8000000-0000-0000-0000-00000000002a', '09000000-0000-0000-0000-00000000000b'),
    ('f8000000-0000-0000-0000-00000000002b', '09000000-0000-0000-0000-00000000000a'),
    ('f7000000-0000-0000-0000-00000000000a', '09000000-0000-0000-0000-00000000000a'),
    ('f7000000-0000-0000-0000-00000000000b', '09000000-0000-0000-0000-00000000000b'),
    ('f7000000-0000-0000-0000-00000000000c', '09000000-0000-0000-0000-00000000000c'),
    ('f7000000-0000-0000-0000-00000000000d', '09000000-0000-0000-0000-00000000000d'),
    ('f7000000-0000-0000-0000-000000000000', null)
  ) as o (id, owner);

-- Per ogni utente: la sua nota e quella di un altro, il file della sua foto e quello di un altro, il suo file senza
-- riga e quello di un altro (per P l'altro e' R, per tutti gli altri e' P).
create table public.proprie_ruoli (
  utente uuid, nota uuid, altra_nota uuid, file text, altro_file text, senza_riga text, altro_senza_riga text
);
insert into public.proprie_ruoli
select ('09000000-0000-0000-0000-00000000000' || s)::uuid,
       ('a8000000-0000-0000-0000-00000000000' || s)::uuid,
       ('a8000000-0000-0000-0000-00000000000' || a)::uuid,
       'e9000000-0000-0000-0000-000000000001/f8000000-0000-0000-0000-00000000000' || s || '.jpg',
       'e9000000-0000-0000-0000-000000000001/f8000000-0000-0000-0000-00000000000' || a || '.jpg',
       'e9000000-0000-0000-0000-000000000001/f7000000-0000-0000-0000-00000000000' || s || '.jpg',
       'e9000000-0000-0000-0000-000000000001/f7000000-0000-0000-0000-00000000000' || a || '.jpg'
  from (values ('a', 'b'), ('b', 'a'), ('c', 'a'), ('d', 'a')) as u (s, a);

-- Esegue un'istruzione come l'utente corrente e dice com'e' andata: 'righe N' (le righe toccate o lette) o il codice
-- dell'errore. Annulla sempre cio' che ha fatto (l'eccezione finale disfa il blocco), cosi' ogni prova parte dalla
-- stessa fixture.
create function public.esito_ruoli(p_sql text) returns text
language plpgsql
as $$
declare
  n bigint;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
    raise exception using errcode = 'P0099', message = 'righe ' || n;
  exception when others then
    if sqlstate = 'P0099' then
      return sqlerrm;
    end if;
    return sqlstate;
  end;
end
$$;

-- Le prove: per ogni tabella e operazione, l'esito atteso per P, R, L e X.
create table public.prove_ruoli (n serial, tabella text, prova text, istruzione text, p text, r text, l text, x text);
insert into public.prove_ruoli (tabella, prova, istruzione, p, r, l, x) values
  -- Esperimenti: chiunque ne crea uno suo; solo il proprietario lo rinomina, ne cambia lo stato o lo elimina.
  ('esperimenti', 'legge', $s$ select 1 from esperimenti where id = 'e9000000-0000-0000-0000-000000000001' $s$,
   'righe 1', 'righe 1', 'righe 1', 'righe 0'),
  ('esperimenti', 'crea il proprio', $s$ insert into esperimenti (id, nome) values ('e9000000-0000-0000-0000-000000000009', 'Nuovo') $s$,
   'righe 1', 'righe 1', 'righe 1', 'righe 1'),
  ('esperimenti', 'rinomina', $s$ update esperimenti set nome = 'Rinominato' where id = 'e9000000-0000-0000-0000-000000000001' $s$,
   'righe 1', 'righe 0', 'righe 0', 'righe 0'),
  ('esperimenti', 'conclude', $s$ update esperimenti set stato = 'concluso' where id = 'e9000000-0000-0000-0000-000000000001' $s$,
   'righe 1', 'righe 0', 'righe 0', 'righe 0'),
  ('esperimenti', 'elimina', $s$ delete from esperimenti where id = 'e9000000-0000-0000-0000-000000000001' $s$,
   'righe 1', 'righe 0', 'righe 0', 'righe 0'),

  -- Configurazione: tutti i membri leggono, solo il proprietario scrive.
  ('fattori', 'legge', $s$ select 1 from fattori where esperimento_id = 'e9000000-0000-0000-0000-000000000001' $s$,
   'righe 2', 'righe 2', 'righe 2', 'righe 0'),
  ('fattori', 'inserisce', $s$ insert into fattori (id, esperimento_id, nome, ordine)
     values ('f9000000-0000-0000-0000-000000000009', 'e9000000-0000-0000-0000-000000000001', 'Nuovo', 9) $s$,
   'righe 1', '42501', '42501', '42501'),
  ('fattori', 'modifica', $s$ update fattori set nome = 'Dosi' where id = 'f9000000-0000-0000-0000-000000000001' $s$,
   'righe 1', 'righe 0', 'righe 0', 'righe 0'),
  ('fattori', 'elimina', $s$ delete from fattori where id = 'f9000000-0000-0000-0000-000000000002' $s$,
   'righe 1', 'righe 0', 'righe 0', 'righe 0'),

  ('livelli', 'legge', $s$ select 1 from livelli where esperimento_id = 'e9000000-0000-0000-0000-000000000001' $s$,
   'righe 2', 'righe 2', 'righe 2', 'righe 0'),
  ('livelli', 'inserisce', $s$ insert into livelli (id, esperimento_id, fattore_id, nome, ordine)
     values ('19000000-0000-0000-0000-000000000009', 'e9000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000001', 'Media', 9) $s$,
   'righe 1', '42501', '42501', '42501'),
  ('livelli', 'modifica', $s$ update livelli set nome = 'Altissima' where id = '19000000-0000-0000-0000-000000000001' $s$,
   'righe 1', 'righe 0', 'righe 0', 'righe 0'),
  ('livelli', 'elimina', $s$ delete from livelli where id = '19000000-0000-0000-0000-000000000002' $s$,
   'righe 1', 'righe 0', 'righe 0', 'righe 0'),

  ('trattamenti', 'legge', $s$ select 1 from trattamenti where esperimento_id = 'e9000000-0000-0000-0000-000000000001' $s$,
   'righe 2', 'righe 2', 'righe 2', 'righe 0'),
  ('trattamenti', 'inserisce', $s$ insert into trattamenti (id, esperimento_id, etichetta, ordine)
     values ('79000000-0000-0000-0000-000000000009', 'e9000000-0000-0000-0000-000000000001', 'T9', 9) $s$,
   'righe 1', '42501', '42501', '42501'),
  ('trattamenti', 'modifica', $s$ update trattamenti set etichetta = 'T1 bis' where id = '79000000-0000-0000-0000-000000000001' $s$,
   'righe 1', 'righe 0', 'righe 0', 'righe 0'),
  ('trattamenti', 'elimina', $s$ delete from trattamenti where id = '79000000-0000-0000-0000-000000000002' $s$,
   'righe 1', 'righe 0', 'righe 0', 'righe 0'),

  ('trattamento_livelli', 'legge', $s$ select 1 from trattamento_livelli where esperimento_id = 'e9000000-0000-0000-0000-000000000001' $s$,
   'righe 1', 'righe 1', 'righe 1', 'righe 0'),
  ('trattamento_livelli', 'inserisce', $s$ insert into trattamento_livelli (esperimento_id, trattamento_id, livello_id)
     values ('e9000000-0000-0000-0000-000000000001', '79000000-0000-0000-0000-000000000002', '19000000-0000-0000-0000-000000000002') $s$,
   'righe 1', '42501', '42501', '42501'),
  ('trattamento_livelli', 'modifica', $s$ update trattamento_livelli set livello_id = livello_id
     where trattamento_id = '79000000-0000-0000-0000-000000000001' $s$,
   'righe 1', 'righe 0', 'righe 0', 'righe 0'),
  ('trattamento_livelli', 'elimina', $s$ delete from trattamento_livelli where trattamento_id = '79000000-0000-0000-0000-000000000001' $s$,
   'righe 1', 'righe 0', 'righe 0', 'righe 0'),

  ('piante', 'legge', $s$ select 1 from piante where esperimento_id = 'e9000000-0000-0000-0000-000000000001' $s$,
   'righe 2', 'righe 2', 'righe 2', 'righe 0'),
  ('piante', 'inserisce', $s$ insert into piante (id, esperimento_id, trattamento_id, etichetta, ordine)
     values ('b9000000-0000-0000-0000-000000000009', 'e9000000-0000-0000-0000-000000000001', '79000000-0000-0000-0000-000000000001', '9', 9) $s$,
   'righe 1', '42501', '42501', '42501'),
  ('piante', 'modifica', $s$ update piante set blocco = 'B' where id = 'b9000000-0000-0000-0000-000000000001' $s$,
   'righe 1', 'righe 0', 'righe 0', 'righe 0'),
  ('piante', 'elimina', $s$ delete from piante where id = 'b9000000-0000-0000-0000-000000000002' $s$,
   'righe 1', 'righe 0', 'righe 0', 'righe 0'),

  ('parametri', 'legge', $s$ select 1 from parametri where esperimento_id = 'e9000000-0000-0000-0000-000000000001' $s$,
   'righe 3', 'righe 3', 'righe 3', 'righe 0'),
  ('parametri', 'inserisce', $s$ insert into parametri (id, esperimento_id, nome, tipo, ordine)
     values ('c9000000-0000-0000-0000-000000000009', 'e9000000-0000-0000-0000-000000000001', 'Nuovo', 'numero', 9) $s$,
   'righe 1', '42501', '42501', '42501'),
  ('parametri', 'modifica', $s$ update parametri set archiviato = true where id = 'c9000000-0000-0000-0000-000000000001' $s$,
   'righe 1', 'righe 0', 'righe 0', 'righe 0'),
  ('parametri', 'elimina', $s$ delete from parametri where id = 'c9000000-0000-0000-0000-000000000003' $s$,
   'righe 1', 'righe 0', 'righe 0', 'righe 0'),

  ('strumenti', 'legge', $s$ select 1 from strumenti where esperimento_id = 'e9000000-0000-0000-0000-000000000001' $s$,
   'righe 2', 'righe 2', 'righe 2', 'righe 0'),
  ('strumenti', 'inserisce', $s$ insert into strumenti (id, esperimento_id, nome, ordine)
     values ('d9000000-0000-0000-0000-000000000009', 'e9000000-0000-0000-0000-000000000001', 'Nuovo', 9) $s$,
   'righe 1', '42501', '42501', '42501'),
  ('strumenti', 'modifica', $s$ update strumenti set archiviato = true where id = 'd9000000-0000-0000-0000-000000000001' $s$,
   'righe 1', 'righe 0', 'righe 0', 'righe 0'),
  ('strumenti', 'elimina', $s$ delete from strumenti where id = 'd9000000-0000-0000-0000-000000000002' $s$,
   'righe 1', 'righe 0', 'righe 0', 'righe 0'),

  ('strumento_parametri', 'legge', $s$ select 1 from strumento_parametri where esperimento_id = 'e9000000-0000-0000-0000-000000000001' $s$,
   'righe 2', 'righe 2', 'righe 2', 'righe 0'),
  ('strumento_parametri', 'inserisce', $s$ insert into strumento_parametri (esperimento_id, strumento_id, parametro_id, ordine)
     values ('e9000000-0000-0000-0000-000000000001', 'd9000000-0000-0000-0000-000000000002', 'c9000000-0000-0000-0000-000000000003', 1) $s$,
   'righe 1', '42501', '42501', '42501'),
  ('strumento_parametri', 'modifica', $s$ update strumento_parametri set obbligatorio = true
     where strumento_id = 'd9000000-0000-0000-0000-000000000001' $s$,
   'righe 1', 'righe 0', 'righe 0', 'righe 0'),
  ('strumento_parametri', 'elimina', $s$ delete from strumento_parametri where strumento_id = 'd9000000-0000-0000-0000-000000000002' $s$,
   'righe 1', 'righe 0', 'righe 0', 'righe 0'),

  -- Membri: ognuno vede la propria riga; nessuna scrittura diretta (solo le RPC).
  ('membri_esperimento', 'legge', $s$ select 1 from membri_esperimento where esperimento_id = 'e9000000-0000-0000-0000-000000000001' $s$,
   'righe 1', 'righe 1', 'righe 1', 'righe 0'),
  ('membri_esperimento', 'inserisce', $s$ insert into membri_esperimento (esperimento_id, utente_id, ruolo)
     values ('e9000000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-00000000000d', 'lettore') $s$,
   '42501', '42501', '42501', '42501'),
  ('membri_esperimento', 'modifica', $s$ update membri_esperimento set ruolo = 'proprietario'
     where esperimento_id = 'e9000000-0000-0000-0000-000000000001' $s$,
   '42501', '42501', '42501', '42501'),
  ('membri_esperimento', 'elimina', $s$ delete from membri_esperimento where esperimento_id = 'e9000000-0000-0000-0000-000000000001' $s$,
   '42501', '42501', '42501', '42501'),

  -- Misure: proprietario e rilevatore creano; il rilevatore corregge ed elimina solo le proprie.
  ('misure', 'legge', $s$ select 1 from misure where esperimento_id = 'e9000000-0000-0000-0000-000000000001' $s$,
   'righe 4', 'righe 4', 'righe 4', 'righe 0'),
  ('misure', 'crea', $s$ insert into misure (id, esperimento_id, pianta_id, strumento_id, data_rilievo, ora, valori)
     values ('a9000000-0000-0000-0000-0000000000e1', 'e9000000-0000-0000-0000-000000000001', 'b9000000-0000-0000-0000-000000000001',
             'd9000000-0000-0000-0000-000000000001', '2026-11-09', '10:00', '{}') $s$,
   'righe 1', 'righe 1', '42501', '42501'),
  ('misure', 'crea a nome di un altro', $s$ insert into misure (id, esperimento_id, pianta_id, strumento_id, data_rilievo, ora, valori, creato_da)
     values ('a9000000-0000-0000-0000-0000000000e2', 'e9000000-0000-0000-0000-000000000001', 'b9000000-0000-0000-0000-000000000001',
             'd9000000-0000-0000-0000-000000000001', '2026-11-09', '10:00', '{}', '09000000-0000-0000-0000-00000000000e') $s$,
   '42501', '42501', '42501', '42501'),
  ('misure', 'corregge le proprie', $s$ update misure set ora = '11:00'
     where esperimento_id = 'e9000000-0000-0000-0000-000000000001' and creato_da = auth.uid() $s$,
   'righe 1', 'righe 1', 'righe 0', 'righe 0'),
  ('misure', 'corregge quelle degli altri', $s$ update misure set ora = '11:00'
     where esperimento_id = 'e9000000-0000-0000-0000-000000000001' and creato_da <> auth.uid() $s$,
   'righe 3', 'righe 0', 'righe 0', 'righe 0'),
  ('misure', 'elimina le proprie', $s$ delete from misure
     where esperimento_id = 'e9000000-0000-0000-0000-000000000001' and creato_da = auth.uid() $s$,
   'righe 1', 'righe 1', 'righe 0', 'righe 0'),
  ('misure', 'elimina quelle degli altri', $s$ delete from misure
     where esperimento_id = 'e9000000-0000-0000-0000-000000000001' and creato_da <> auth.uid() $s$,
   'righe 3', 'righe 0', 'righe 0', 'righe 0'),
  -- L'upsert della coda d'invio (PostgREST mette nel SET tutte le colonne del payload).
  ('misure', 'upsert della misura di P', $s$ insert into misure (id, esperimento_id, pianta_id, strumento_id, data_rilievo, ora, valori)
     values ('a9000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-000000000001', 'b9000000-0000-0000-0000-000000000001',
             'd9000000-0000-0000-0000-000000000001', '2026-11-08', '12:00', '{}')
     on conflict (id) do update set id = excluded.id, esperimento_id = excluded.esperimento_id, pianta_id = excluded.pianta_id,
       strumento_id = excluded.strumento_id, data_rilievo = excluded.data_rilievo, ora = excluded.ora, valori = excluded.valori $s$,
   'righe 1', '42501', '42501', '42501'),
  ('misure', 'upsert della misura di R', $s$ insert into misure (id, esperimento_id, pianta_id, strumento_id, data_rilievo, ora, valori)
     values ('a9000000-0000-0000-0000-00000000000b', 'e9000000-0000-0000-0000-000000000001', 'b9000000-0000-0000-0000-000000000001',
             'd9000000-0000-0000-0000-000000000001', '2026-11-08', '12:00', '{}')
     on conflict (id) do update set id = excluded.id, esperimento_id = excluded.esperimento_id, pianta_id = excluded.pianta_id,
       strumento_id = excluded.strumento_id, data_rilievo = excluded.data_rilievo, ora = excluded.ora, valori = excluded.valori $s$,
   'righe 1', 'righe 1', '42501', '42501'),

  -- Note: come le misure (spuntare un promemoria e' una correzione).
  ('note', 'legge', $s$ select 1 from note where esperimento_id = 'e9000000-0000-0000-0000-000000000001' $s$,
   'righe 4', 'righe 4', 'righe 4', 'righe 0'),
  ('note', 'crea', $s$ insert into note (id, esperimento_id, data, testo)
     values ('a8000000-0000-0000-0000-0000000000e1', 'e9000000-0000-0000-0000-000000000001', '2026-11-09', 'Nuova') $s$,
   'righe 1', 'righe 1', '42501', '42501'),
  ('note', 'crea a nome di un altro', $s$ insert into note (id, esperimento_id, data, testo, creato_da)
     values ('a8000000-0000-0000-0000-0000000000e2', 'e9000000-0000-0000-0000-000000000001', '2026-11-09', 'Nuova',
             '09000000-0000-0000-0000-00000000000e') $s$,
   '42501', '42501', '42501', '42501'),
  ('note', 'corregge le proprie', $s$ update note set fatto_il = now()
     where esperimento_id = 'e9000000-0000-0000-0000-000000000001' and creato_da = auth.uid() $s$,
   'righe 1', 'righe 1', 'righe 0', 'righe 0'),
  ('note', 'corregge quelle degli altri', $s$ update note set fatto_il = now()
     where esperimento_id = 'e9000000-0000-0000-0000-000000000001' and creato_da <> auth.uid() $s$,
   'righe 3', 'righe 0', 'righe 0', 'righe 0'),
  ('note', 'elimina le proprie', $s$ delete from note
     where esperimento_id = 'e9000000-0000-0000-0000-000000000001' and creato_da = auth.uid() $s$,
   'righe 1', 'righe 1', 'righe 0', 'righe 0'),
  ('note', 'elimina quelle degli altri', $s$ delete from note
     where esperimento_id = 'e9000000-0000-0000-0000-000000000001' and creato_da <> auth.uid() $s$,
   'righe 3', 'righe 0', 'righe 0', 'righe 0'),
  ('note', 'upsert della nota di P', $s$ insert into note (id, esperimento_id, data, testo, promemoria)
     values ('a8000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-000000000001', '2026-11-08', 'Cambiata', false)
     on conflict (id) do update set id = excluded.id, esperimento_id = excluded.esperimento_id, data = excluded.data,
       testo = excluded.testo, promemoria = excluded.promemoria $s$,
   'righe 1', '42501', '42501', '42501'),
  ('note', 'upsert della nota di R', $s$ insert into note (id, esperimento_id, data, testo, promemoria)
     values ('a8000000-0000-0000-0000-00000000000b', 'e9000000-0000-0000-0000-000000000001', '2026-11-08', 'Cambiata', false)
     on conflict (id) do update set id = excluded.id, esperimento_id = excluded.esperimento_id, data = excluded.data,
       testo = excluded.testo, promemoria = excluded.promemoria $s$,
   'righe 1', 'righe 1', '42501', '42501'),

  -- Collegamenti delle note: solo chi puo' modificare la nota.
  ('note_piante', 'legge', $s$ select 1 from note_piante where esperimento_id = 'e9000000-0000-0000-0000-000000000001' $s$,
   'righe 4', 'righe 4', 'righe 4', 'righe 0'),
  ('note_piante', 'collega la propria nota', $s$ insert into note_piante (nota_id, pianta_id, esperimento_id)
     values ((select nota from proprie_ruoli where utente = auth.uid()), 'b9000000-0000-0000-0000-000000000002',
             'e9000000-0000-0000-0000-000000000001') $s$,
   'righe 1', 'righe 1', '42501', '42501'),
  ('note_piante', 'collega la nota di un altro', $s$ insert into note_piante (nota_id, pianta_id, esperimento_id)
     values ((select altra_nota from proprie_ruoli where utente = auth.uid()), 'b9000000-0000-0000-0000-000000000002',
             'e9000000-0000-0000-0000-000000000001') $s$,
   'righe 1', '42501', '42501', '42501'),
  ('note_piante', 'modifica i propri', $s$ update note_piante set pianta_id = pianta_id
     where nota_id = (select nota from proprie_ruoli where utente = auth.uid()) $s$,
   'righe 1', 'righe 1', 'righe 0', 'righe 0'),
  ('note_piante', 'modifica quelli degli altri', $s$ update note_piante set pianta_id = pianta_id
     where nota_id <> (select nota from proprie_ruoli where utente = auth.uid()) $s$,
   'righe 3', 'righe 0', 'righe 0', 'righe 0'),
  ('note_piante', 'scollega la propria nota', $s$ delete from note_piante
     where nota_id = (select nota from proprie_ruoli where utente = auth.uid()) $s$,
   'righe 1', 'righe 1', 'righe 0', 'righe 0'),
  ('note_piante', 'scollega le note degli altri', $s$ delete from note_piante
     where nota_id <> (select nota from proprie_ruoli where utente = auth.uid()) $s$,
   'righe 3', 'righe 0', 'righe 0', 'righe 0'),
  ('note_piante', 'upsert sulla nota di P', $s$ insert into note_piante (nota_id, pianta_id, esperimento_id)
     values ('a8000000-0000-0000-0000-00000000000a', 'b9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-000000000001')
     on conflict (nota_id, pianta_id) do update set
       nota_id = excluded.nota_id, pianta_id = excluded.pianta_id, esperimento_id = excluded.esperimento_id $s$,
   'righe 1', '42501', '42501', '42501'),

  ('note_trattamenti', 'legge', $s$ select 1 from note_trattamenti where esperimento_id = 'e9000000-0000-0000-0000-000000000001' $s$,
   'righe 4', 'righe 4', 'righe 4', 'righe 0'),
  ('note_trattamenti', 'collega la propria nota', $s$ insert into note_trattamenti (nota_id, trattamento_id, esperimento_id)
     values ((select nota from proprie_ruoli where utente = auth.uid()), '79000000-0000-0000-0000-000000000002',
             'e9000000-0000-0000-0000-000000000001') $s$,
   'righe 1', 'righe 1', '42501', '42501'),
  ('note_trattamenti', 'collega la nota di un altro', $s$ insert into note_trattamenti (nota_id, trattamento_id, esperimento_id)
     values ((select altra_nota from proprie_ruoli where utente = auth.uid()), '79000000-0000-0000-0000-000000000002',
             'e9000000-0000-0000-0000-000000000001') $s$,
   'righe 1', '42501', '42501', '42501'),
  ('note_trattamenti', 'modifica i propri', $s$ update note_trattamenti set trattamento_id = trattamento_id
     where nota_id = (select nota from proprie_ruoli where utente = auth.uid()) $s$,
   'righe 1', 'righe 1', 'righe 0', 'righe 0'),
  ('note_trattamenti', 'modifica quelli degli altri', $s$ update note_trattamenti set trattamento_id = trattamento_id
     where nota_id <> (select nota from proprie_ruoli where utente = auth.uid()) $s$,
   'righe 3', 'righe 0', 'righe 0', 'righe 0'),
  ('note_trattamenti', 'scollega la propria nota', $s$ delete from note_trattamenti
     where nota_id = (select nota from proprie_ruoli where utente = auth.uid()) $s$,
   'righe 1', 'righe 1', 'righe 0', 'righe 0'),
  ('note_trattamenti', 'scollega le note degli altri', $s$ delete from note_trattamenti
     where nota_id <> (select nota from proprie_ruoli where utente = auth.uid()) $s$,
   'righe 3', 'righe 0', 'righe 0', 'righe 0'),

  -- Foto (righe): P ne ha 3 (FP, FA, FPR), R 3 (FR, FRnf, FRP), L e X una.
  ('foto', 'legge', $s$ select 1 from foto where esperimento_id = 'e9000000-0000-0000-0000-000000000001' $s$,
   'righe 8', 'righe 8', 'righe 8', 'righe 0'),
  ('foto', 'crea', $s$ insert into foto (id, esperimento_id, data, percorso)
     values ('f8000000-0000-0000-0000-0000000000e1', 'e9000000-0000-0000-0000-000000000001', '2026-11-09',
             'e9000000-0000-0000-0000-000000000001/f8000000-0000-0000-0000-0000000000e1.jpg') $s$,
   'righe 1', 'righe 1', '42501', '42501'),
  ('foto', 'crea a nome di un altro', $s$ insert into foto (id, esperimento_id, data, percorso, creato_da)
     values ('f8000000-0000-0000-0000-0000000000e2', 'e9000000-0000-0000-0000-000000000001', '2026-11-09',
             'e9000000-0000-0000-0000-000000000001/f8000000-0000-0000-0000-0000000000e2.jpg', '09000000-0000-0000-0000-00000000000e') $s$,
   '42501', '42501', '42501', '42501'),
  ('foto', 'corregge le proprie', $s$ update foto set data = '2026-11-07'
     where esperimento_id = 'e9000000-0000-0000-0000-000000000001' and creato_da = auth.uid() $s$,
   'righe 3', 'righe 3', 'righe 0', 'righe 0'),
  ('foto', 'corregge quelle degli altri', $s$ update foto set data = '2026-11-07'
     where esperimento_id = 'e9000000-0000-0000-0000-000000000001' and creato_da <> auth.uid() $s$,
   'righe 5', 'righe 0', 'righe 0', 'righe 0'),
  ('foto', 'archivia quelle degli altri', $s$ update foto set archiviata = true, archiviata_il = now()
     where esperimento_id = 'e9000000-0000-0000-0000-000000000001' and creato_da <> auth.uid() and not archiviata $s$,
   'righe 5', 'righe 0', 'righe 0', 'righe 0'),
  ('foto', 'elimina le proprie', $s$ delete from foto
     where esperimento_id = 'e9000000-0000-0000-0000-000000000001' and creato_da = auth.uid() $s$,
   'righe 3', 'righe 3', 'righe 0', 'righe 0'),
  ('foto', 'elimina quelle degli altri', $s$ delete from foto
     where esperimento_id = 'e9000000-0000-0000-0000-000000000001' and creato_da <> auth.uid() $s$,
   'righe 5', 'righe 0', 'righe 0', 'righe 0'),
  ('foto', 'upsert della foto di P', $s$ insert into foto (id, esperimento_id, data, percorso, pianta_id, nota_id, archiviata)
     values ('f8000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-000000000001', '2026-11-07',
             'e9000000-0000-0000-0000-000000000001/f8000000-0000-0000-0000-00000000000a.jpg', null, null, false)
     on conflict (id) do update set id = excluded.id, esperimento_id = excluded.esperimento_id, data = excluded.data,
       percorso = excluded.percorso, pianta_id = excluded.pianta_id, nota_id = excluded.nota_id $s$,
   'righe 1', '42501', '42501', '42501'),
  ('foto', 'upsert della foto di R', $s$ insert into foto (id, esperimento_id, data, percorso, pianta_id, nota_id, archiviata)
     values ('f8000000-0000-0000-0000-00000000000b', 'e9000000-0000-0000-0000-000000000001', '2026-11-07',
             'e9000000-0000-0000-0000-000000000001/f8000000-0000-0000-0000-00000000000b.jpg', null, null, false)
     on conflict (id) do update set id = excluded.id, esperimento_id = excluded.esperimento_id, data = excluded.data,
       percorso = excluded.percorso, pianta_id = excluded.pianta_id, nota_id = excluded.nota_id $s$,
   'righe 1', 'righe 1', '42501', '42501'),

  -- File delle foto nello Storage. Il rilevatore elimina solo i file caricati da lui, e se c'e' la riga deve essere sua.
  ('storage.objects', 'legge', $s$ select 1 from storage.objects where bucket_id = 'foto'
     and name like 'e9000000-0000-0000-0000-000000000001/%' $s$,
   'righe 11', 'righe 11', 'righe 11', 'righe 0'),
  ('storage.objects', 'carica una foto nuova', $s$ insert into storage.objects (bucket_id, name, owner)
     values ('foto', 'e9000000-0000-0000-0000-000000000001/f7000000-0000-0000-0000-0000000000e1.jpg', auth.uid()) $s$,
   'righe 1', 'righe 1', '42501', '42501'),
  ('storage.objects', 'carica il file della propria riga', $s$ insert into storage.objects (bucket_id, name, owner)
     values ('foto', 'e9000000-0000-0000-0000-000000000001/f8000000-0000-0000-0000-00000000001b.jpg', auth.uid()) $s$,
   'righe 1', 'righe 1', '42501', '42501'),
  ('storage.objects', 'carica sul percorso della foto archiviata di P', $s$ insert into storage.objects (bucket_id, name, owner)
     values ('foto', 'e9000000-0000-0000-0000-000000000001/f8000000-0000-0000-0000-00000000001a.jpg', auth.uid()) $s$,
   'righe 1', '42501', '42501', '42501'),
  ('storage.objects', 'non sposta ne'' sovrascrive', $s$ update storage.objects set name = name where bucket_id = 'foto' $s$,
   'righe 0', 'righe 0', 'righe 0', 'righe 0'),
  ('storage.objects', 'elimina il file della propria foto', $s$ delete from storage.objects where bucket_id = 'foto'
     and name = (select file from proprie_ruoli where utente = auth.uid()) $s$,
   'righe 1', 'righe 1', 'righe 0', 'righe 0'),
  ('storage.objects', 'elimina il file della foto di un altro', $s$ delete from storage.objects where bucket_id = 'foto'
     and name = (select altro_file from proprie_ruoli where utente = auth.uid()) $s$,
   'righe 1', 'righe 0', 'righe 0', 'righe 0'),
  ('storage.objects', 'elimina il file caricato da R per la riga di P', $s$ delete from storage.objects where bucket_id = 'foto'
     and name = 'e9000000-0000-0000-0000-000000000001/f8000000-0000-0000-0000-00000000002a.jpg' $s$,
   'righe 1', 'righe 0', 'righe 0', 'righe 0'),
  ('storage.objects', 'elimina il file caricato da P per una riga di R', $s$ delete from storage.objects where bucket_id = 'foto'
     and name = 'e9000000-0000-0000-0000-000000000001/f8000000-0000-0000-0000-00000000002b.jpg' $s$,
   'righe 1', 'righe 0', 'righe 0', 'righe 0'),
  ('storage.objects', 'elimina il proprio file senza riga', $s$ delete from storage.objects where bucket_id = 'foto'
     and name = (select senza_riga from proprie_ruoli where utente = auth.uid()) $s$,
   'righe 1', 'righe 1', 'righe 0', 'righe 0'),
  ('storage.objects', 'elimina il file senza riga di un altro', $s$ delete from storage.objects where bucket_id = 'foto'
     and name = (select altro_senza_riga from proprie_ruoli where utente = auth.uid()) $s$,
   'righe 1', 'righe 0', 'righe 0', 'righe 0'),
  ('storage.objects', 'elimina il file senza riga e senza autore', $s$ delete from storage.objects where bucket_id = 'foto'
     and name = 'e9000000-0000-0000-0000-000000000001/f7000000-0000-0000-0000-000000000000.jpg' $s$,
   'righe 1', 'righe 0', 'righe 0', 'righe 0'),
  ('storage.objects', 'svuota la cartella (eliminare l''esperimento)', $s$ delete from storage.objects where bucket_id = 'foto'
     and name like 'e9000000-0000-0000-0000-000000000001/%' $s$,
   'righe 11', 'righe 2', 'righe 0', 'righe 0');

-- ===== Struttura =====
select is_empty(
  $$ select tablename, policyname from pg_policies
      where schemaname = 'public' and cmd = 'ALL' and tablename <> 'inviti' $$,
  'nessuna policy "for all" sulle tabelle degli esperimenti (resta solo quella degli inviti, dell''amministratore)');

select is_empty(
  $$ select t.tabella
       from unnest(array['esperimenti', 'fattori', 'livelli', 'trattamenti', 'trattamento_livelli', 'piante', 'parametri',
                         'strumenti', 'strumento_parametri', 'misure', 'note', 'note_piante', 'note_trattamenti', 'foto',
                         'export_salvati']) as t (tabella)
      where (select array_agg(cmd::text order by cmd) from pg_policies
              where schemaname = 'public' and tablename = t.tabella) is distinct from array['DELETE', 'INSERT', 'SELECT', 'UPDATE'] $$,
  'ogni tabella dell''esperimento ha una policy per operazione: select, insert, update, delete');

select is_empty(
  $$ select tablename, policyname from pg_policies
      where (schemaname = 'public' or (schemaname = 'storage' and policyname like 'fastlab_foto%'))
        and not (roles @> array['authenticated']::name[] and cardinality(roles) = 1) $$,
  'tutte le policy sono solo per authenticated');

select results_eq(
  $$ select cmd::text from pg_policies where schemaname = 'public' and tablename = 'membri_esperimento' $$,
  $$ values ('SELECT') $$,
  'membri_esperimento: solo la lettura della propria riga, nessuna scrittura diretta');

select results_eq(
  $$ select cmd::text from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'fastlab_foto%'
      order by 1 $$,
  $$ values ('DELETE'), ('INSERT'), ('SELECT') $$,
  'Storage: lettura, caricamento ed eliminazione, nessun update');

select is_empty(
  $$ select p.proname from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proname in ('ruolo_in', 'puo_scrivere', 'puo_configurare', 'puo_modificare_nota', 'puo_caricare_file_foto',
                          'puo_eliminare_file_foto', 'membri_di', 'aggiungi_membro', 'togli_membro', 'autori_catalogo')
        and not (p.prosecdef and p.proconfig = array['search_path=""']
                 and has_function_privilege('authenticated', p.oid, 'execute')
                 and not has_function_privilege('anon', p.oid, 'execute')) $$,
  'le funzioni dei ruoli sono security definer, con search_path vuoto, per authenticated e non per anon');

select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('ruolo_in', 'puo_scrivere', 'puo_configurare', 'puo_modificare_nota', 'puo_caricare_file_foto',
                        'puo_eliminare_file_foto', 'membri_di', 'autori_catalogo')
      and p.provolatile = 's'),
  8,
  'le funzioni che leggono sono stable (aggiungi_membro e togli_membro scrivono)');

select throws_ok(
  $$ insert into membri_esperimento (esperimento_id, utente_id, ruolo)
     values ('e9000000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-00000000000d', 'collaboratore') $$,
  '23514', null,
  'il ruolo collaboratore non esiste piu'': proprietario, rilevatore o lettore');

select is(
  (select array_to_string(p.proargnames, ',') from pg_proc p where p.oid = 'public.riepilogo_esperimenti()'::regprocedure),
  'id,nome,stato,data_inizio,n_piante,n_trattamenti,ultima_data,piante_ultima_data,ruolo',
  'riepilogo_esperimenti ha le colonne di prima, nello stesso ordine, e il ruolo in fondo');

-- ===== Le prove, per ognuno dei quattro =====
set local role authenticated;

select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
select is(array_agg(public.esito_ruoli(istruzione) order by n), array_agg(p order by n),
          'proprietario, ' || tabella || ': ' || string_agg(prova, ', ' order by n))
  from public.prove_ruoli group by tabella order by min(n);

select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);
select is(array_agg(public.esito_ruoli(istruzione) order by n), array_agg(r order by n),
          'rilevatore, ' || tabella || ': ' || string_agg(prova, ', ' order by n))
  from public.prove_ruoli group by tabella order by min(n);

select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000c', 'role', 'authenticated')::text, true);
select is(array_agg(public.esito_ruoli(istruzione) order by n), array_agg(l order by n),
          'lettore, ' || tabella || ': ' || string_agg(prova, ', ' order by n))
  from public.prove_ruoli group by tabella order by min(n);

select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000d', 'role', 'authenticated')::text, true);
select is(array_agg(public.esito_ruoli(istruzione) order by n), array_agg(x order by n),
          'estraneo, ' || tabella || ': ' || string_agg(prova, ', ' order by n))
  from public.prove_ruoli group by tabella order by min(n);

-- ===== Il rilevatore e la coda d'invio: l'upsert di una misura altrui e' un rifiuto (42501), non un'attesa =====
select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ insert into misure (id, esperimento_id, pianta_id, strumento_id, data_rilievo, ora, valori)
     values ('a9000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-000000000001', 'b9000000-0000-0000-0000-000000000001',
             'd9000000-0000-0000-0000-000000000001', '2026-11-08', '12:00', '{}')
     on conflict (id) do update set id = excluded.id, esperimento_id = excluded.esperimento_id, pianta_id = excluded.pianta_id,
       strumento_id = excluded.strumento_id, data_rilievo = excluded.data_rilievo, ora = excluded.ora, valori = excluded.valori $$,
  '42501', null,
  'rilevatore: l''upsert di una misura del proprietario e'' rifiutato con 42501');

-- ===== Flussi dell'app per il rilevatore =====
-- eliminaFoto: prima la riga, poi il file, che a quel punto non ha piu' una riga e si riconosce da chi l'ha caricato.
select isnt_empty(
  $$ delete from foto where id = 'f8000000-0000-0000-0000-00000000000b' returning id $$,
  'rilevatore: elimina la riga della propria foto');
select isnt_empty(
  $$ delete from storage.objects where bucket_id = 'foto'
       and name = 'e9000000-0000-0000-0000-000000000001/f8000000-0000-0000-0000-00000000000b.jpg' returning id $$,
  'rilevatore: poi ne elimina il file, rimasto senza riga');

-- caricaFoto: il file prima della riga; se la riga e' rifiutata il file appena caricato si toglie.
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('foto', 'e9000000-0000-0000-0000-000000000001/f7000000-0000-0000-0000-0000000000e2.jpg', auth.uid()) $$,
  'rilevatore: carica il file di una foto nuova');
select isnt_empty(
  $$ delete from storage.objects where bucket_id = 'foto'
       and name = 'e9000000-0000-0000-0000-000000000001/f7000000-0000-0000-0000-0000000000e2.jpg' returning id $$,
  'rilevatore: toglie il file appena caricato se la riga non si scrive');

-- "Libera lo spazio" su una foto del proprietario: il file non si toglie e la riga non si segna.
select is_empty(
  $$ delete from storage.objects where bucket_id = 'foto'
       and name = 'e9000000-0000-0000-0000-000000000001/f8000000-0000-0000-0000-00000000000a.jpg' returning id $$,
  'rilevatore: non toglie il file di una foto del proprietario');
select is_empty(
  $$ update foto set archiviata = true, archiviata_il = now() where id = 'f8000000-0000-0000-0000-00000000000a' returning id $$,
  'rilevatore: non segna archiviata una foto del proprietario');

-- ===== Flussi del proprietario =====
select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);

-- "Libera lo spazio" su una foto di un altro (X, ormai fuori dall'esperimento).
select isnt_empty(
  $$ delete from storage.objects where bucket_id = 'foto'
       and name = 'e9000000-0000-0000-0000-000000000001/f8000000-0000-0000-0000-00000000000d.jpg' returning id $$,
  'proprietario: toglie il file della foto di un altro dopo l''archivio');
select isnt_empty(
  $$ update foto set archiviata = true, archiviata_il = now() where id = 'f8000000-0000-0000-0000-00000000000d' returning id $$,
  'proprietario: e la segna archiviata');

-- ===== ruolo_in, puo_scrivere, puo_configurare =====
select is(
  array[ruolo_in('e9000000-0000-0000-0000-000000000001'), puo_scrivere('e9000000-0000-0000-0000-000000000001')::text,
        puo_configurare('e9000000-0000-0000-0000-000000000001')::text],
  array['proprietario', 'true', 'true'],
  'proprietario: scrive e configura');

select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);
select is(
  array[ruolo_in('e9000000-0000-0000-0000-000000000001'), puo_scrivere('e9000000-0000-0000-0000-000000000001')::text,
        puo_configurare('e9000000-0000-0000-0000-000000000001')::text],
  array['rilevatore', 'true', 'false'],
  'rilevatore: scrive, non configura');

select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000c', 'role', 'authenticated')::text, true);
select is(
  array[ruolo_in('e9000000-0000-0000-0000-000000000001'), puo_scrivere('e9000000-0000-0000-0000-000000000001')::text,
        puo_configurare('e9000000-0000-0000-0000-000000000001')::text],
  array['lettore', 'false', 'false'],
  'lettore: ne'' scrive ne'' configura');

select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000d', 'role', 'authenticated')::text, true);
select is(
  array[ruolo_in('e9000000-0000-0000-0000-000000000001'), puo_scrivere('e9000000-0000-0000-0000-000000000001')::text,
        puo_configurare('e9000000-0000-0000-0000-000000000001')::text],
  array[null, 'false', 'false'],
  'estraneo: nessun ruolo');

select is(
  array[ruolo_in(null), puo_scrivere(null)::text, puo_configurare(null)::text],
  array[null, 'false', 'false'],
  'con un esperimento null: nessun ruolo, false e non null');

-- ===== riepilogo_esperimenti con il ruolo =====
select is_empty(
  $$ select 1 from riepilogo_esperimenti() where id = 'e9000000-0000-0000-0000-000000000001' $$,
  'riepilogo_esperimenti: l''estraneo non vede l''esperimento');

select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000c', 'role', 'authenticated')::text, true);
select results_eq(
  $$ select nome, ruolo from riepilogo_esperimenti() where id = 'e9000000-0000-0000-0000-000000000001' $$,
  $$ values ('E ruoli'::text, 'lettore'::text) $$,
  'riepilogo_esperimenti: il lettore lo vede con il suo ruolo');

select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);
select results_eq(
  $$ select ruolo from riepilogo_esperimenti() where id = 'e9000000-0000-0000-0000-000000000001' $$,
  $$ values ('rilevatore'::text) $$,
  'riepilogo_esperimenti: il rilevatore lo vede con il suo ruolo');

select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
select results_eq(
  $$ select ruolo from riepilogo_esperimenti() where id = 'e9000000-0000-0000-0000-000000000001' $$,
  $$ values ('proprietario'::text) $$,
  'riepilogo_esperimenti: il proprietario lo vede con il suo ruolo');

-- ===== membri_di =====
select results_eq(
  $$ select email, ruolo, sei_tu from membri_di('e9000000-0000-0000-0000-000000000001') $$,
  $$ values ('p.ruoli@test.it'::text, 'proprietario'::text, true),
            ('r.ruoli@test.it', 'rilevatore', false),
            ('l.ruoli@test.it', 'lettore', false) $$,
  'membri_di: proprietari, rilevatori, lettori, con "tu"');

select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000c', 'role', 'authenticated')::text, true);
select results_eq(
  $$ select utente_id, sei_tu from membri_di('e9000000-0000-0000-0000-000000000001') where sei_tu $$,
  $$ values ('09000000-0000-0000-0000-00000000000c'::uuid, true) $$,
  'membri_di: anche il lettore vede chi c''e'' e si riconosce');

select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000d', 'role', 'authenticated')::text, true);
select is_empty(
  $$ select * from membri_di('e9000000-0000-0000-0000-000000000001') $$,
  'membri_di: nessuna riga per un estraneo');

-- ===== aggiungi_membro =====
select throws_ok(
  $$ select aggiungi_membro('e9000000-0000-0000-0000-000000000001', 'x.ruoli@test.it', 'rilevatore') $$,
  '42501', 'SOLO_PROPRIETARIO',
  'aggiungi_membro: un estraneo non si aggiunge');

select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select aggiungi_membro('e9000000-0000-0000-0000-000000000001', 'x.ruoli@test.it', 'lettore') $$,
  '42501', 'SOLO_PROPRIETARIO',
  'aggiungi_membro: il rilevatore non aggiunge');
select throws_ok(
  $$ select aggiungi_membro('e9000000-0000-0000-0000-000000000001', 'r.ruoli@test.it', 'proprietario') $$,
  '42501', 'SOLO_PROPRIETARIO',
  'aggiungi_membro: il rilevatore non si promuove');

select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000c', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select aggiungi_membro('e9000000-0000-0000-0000-000000000001', 'x.ruoli@test.it', 'lettore') $$,
  '42501', 'SOLO_PROPRIETARIO',
  'aggiungi_membro: il lettore non aggiunge');

select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select aggiungi_membro('e9000000-0000-0000-0000-000000000001', 'nessuno@test.it', 'lettore') $$,
  'P0001', 'UTENTE_NON_TROVATO',
  'aggiungi_membro: un''email senza account');
select throws_ok(
  $$ select aggiungi_membro('e9000000-0000-0000-0000-000000000001', 'nuovo.ruoli@test.it', 'collaboratore') $$,
  'P0001', 'RUOLO_NON_VALIDO',
  'aggiungi_membro: un ruolo che non esiste');
select throws_ok(
  $$ select aggiungi_membro('e9000000-0000-0000-0000-000000000001', 'nuovo.ruoli@test.it', null) $$,
  'P0001', 'RUOLO_NON_VALIDO',
  'aggiungi_membro: un ruolo vuoto');
select throws_ok(
  $$ select aggiungi_membro('e9000000-0000-0000-0000-000000000009', 'nuovo.ruoli@test.it', 'lettore') $$,
  '42501', 'SOLO_PROPRIETARIO',
  'aggiungi_membro: un esperimento che non esiste');

select lives_ok(
  $$ select aggiungi_membro('e9000000-0000-0000-0000-000000000001', '  Nuovo.Ruoli@TEST.it ', 'lettore') $$,
  'aggiungi_membro: il proprietario aggiunge un collega con l''email scritta con maiuscole e spazi');
select results_eq(
  $$ select ruolo from membri_di('e9000000-0000-0000-0000-000000000001') where email = 'nuovo.ruoli@test.it' $$,
  $$ values ('lettore'::text) $$,
  'aggiungi_membro: il collega e'' lettore');

select lives_ok(
  $$ select aggiungi_membro('e9000000-0000-0000-0000-000000000001', 'nuovo.ruoli@test.it', 'rilevatore') $$,
  'aggiungi_membro: aggiungerlo di nuovo cambia il ruolo');
select results_eq(
  $$ select ruolo from membri_di('e9000000-0000-0000-0000-000000000001') where email = 'nuovo.ruoli@test.it' $$,
  $$ values ('rilevatore'::text) $$,
  'aggiungi_membro: una riga sola, con il ruolo nuovo');

select lives_ok(
  $$ select aggiungi_membro('e9000000-0000-0000-0000-000000000001', 'p2.ruoli@test.it', 'proprietario') $$,
  'aggiungi_membro: un secondo proprietario');
select lives_ok(
  $$ select aggiungi_membro('e9000000-0000-0000-0000-000000000001', 'p.ruoli@test.it', 'rilevatore') $$,
  'aggiungi_membro: con un altro proprietario, il primo puo'' passare a rilevatore');
select throws_ok(
  $$ select aggiungi_membro('e9000000-0000-0000-0000-000000000001', 'p.ruoli@test.it', 'proprietario') $$,
  '42501', 'SOLO_PROPRIETARIO',
  'aggiungi_membro: da rilevatore non torna proprietario da solo');

select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000e', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select aggiungi_membro('e9000000-0000-0000-0000-000000000001', 'p2.ruoli@test.it', 'lettore') $$,
  'P0001', 'ULTIMO_PROPRIETARIO',
  'aggiungi_membro: l''ultimo proprietario non cambia il proprio ruolo');
select is(
  ruolo_in('e9000000-0000-0000-0000-000000000001'),
  'proprietario',
  'aggiungi_membro: e resta proprietario');
select lives_ok(
  $$ select aggiungi_membro('e9000000-0000-0000-0000-000000000001', 'p.ruoli@test.it', 'proprietario') $$,
  'aggiungi_membro: il secondo proprietario rende di nuovo proprietario il primo');

-- ===== togli_membro =====
select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select togli_membro('e9000000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-00000000000c') $$,
  '42501', 'SOLO_PROPRIETARIO',
  'togli_membro: il rilevatore non toglie gli altri');

select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000d', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select togli_membro('e9000000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-00000000000b') $$,
  '42501', 'SOLO_PROPRIETARIO',
  'togli_membro: un estraneo non toglie nessuno');
select lives_ok(
  $$ select togli_membro('e9000000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-00000000000d') $$,
  'togli_membro: un estraneo che "lascia" un esperimento non suo non cambia nulla');

select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select togli_membro('e9000000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-00000000000b') $$,
  'togli_membro: il proprietario toglie il rilevatore');
select is(
  (select count(*)::int from misure where creato_da = '09000000-0000-0000-0000-00000000000b'),
  1,
  'togli_membro: le misure del rilevatore restano');
select results_eq(
  $$ select email from membri_di('e9000000-0000-0000-0000-000000000001') $$,
  $$ values ('p.ruoli@test.it'::text), ('p2.ruoli@test.it'), ('nuovo.ruoli@test.it'), ('l.ruoli@test.it') $$,
  'togli_membro: il rilevatore non c''e'' piu'' (e l''ordine e'' per ruolo, poi per email)');

select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ insert into misure (id, esperimento_id, pianta_id, strumento_id, data_rilievo, ora, valori)
     values ('a9000000-0000-0000-0000-00000000000b', 'e9000000-0000-0000-0000-000000000001', 'b9000000-0000-0000-0000-000000000001',
             'd9000000-0000-0000-0000-000000000001', '2026-11-08', '12:00', '{}')
     on conflict (id) do update set ora = excluded.ora $$,
  '42501', null,
  'togli_membro: la coda di chi e'' stato tolto e'' rifiutata con 42501, anche sulle proprie misure');

select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000c', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select togli_membro('e9000000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-00000000000c') $$,
  'togli_membro: il lettore lascia l''esperimento');
select is(
  ruolo_in('e9000000-0000-0000-0000-000000000001'),
  null,
  'togli_membro: e non ne e'' piu'' membro');

select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000e', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select togli_membro('e9000000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-00000000000e') $$,
  'togli_membro: un proprietario lascia se ne resta un altro');

select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select togli_membro('e9000000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-00000000000a') $$,
  'P0001', 'ULTIMO_PROPRIETARIO',
  'togli_membro: l''ultimo proprietario non lascia');
select is(
  ruolo_in('e9000000-0000-0000-0000-000000000001'),
  'proprietario',
  'togli_membro: e resta proprietario');

-- Eliminare l'esperimento: il proprietario svuota la cartella dello Storage, anche i file senza riga o senza autore.
with tolti as (
  delete from storage.objects where bucket_id = 'foto' and name like 'e9000000-0000-0000-0000-000000000001/%' returning 1
)
select is(
  (select count(*)::int from tolti),
  9,
  'proprietario: toglie tutti i file rimasti nella cartella dell''esperimento');

-- ===== crea_esperimento: chi crea e' proprietario e scrive la configurazione =====
select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000c', 'role', 'authenticated')::text, true);
select is(
  crea_esperimento('{
    "esperimento": {"id": "e9000000-0000-0000-0000-000000000002", "nome": "Di L", "data_inizio": null, "note": "", "stato": "in_corso"},
    "fattori": [{"id": "f9000000-0000-0000-0000-000000000021", "nome": "Dose", "ordine": 0,
                 "livelli": [{"id": "19000000-0000-0000-0000-000000000021", "nome": "Alta", "ordine": 0}]}],
    "trattamenti": [{"id": "79000000-0000-0000-0000-000000000021", "etichetta": "Alta", "ordine": 0,
                     "livello_ids": ["19000000-0000-0000-0000-000000000021"]}],
    "piante": [{"id": "b9000000-0000-0000-0000-000000000021", "trattamento_id": "79000000-0000-0000-0000-000000000021",
                "etichetta": "1", "blocco": null, "ordine": 0}],
    "parametri": [{"id": "c9000000-0000-0000-0000-000000000021", "nome": "Altezza", "unita": "cm", "tipo": "numero", "ordine": 0}],
    "strumenti": [{"id": "d9000000-0000-0000-0000-000000000021", "nome": "Metro", "icona": null, "ordine": 0,
                 "parametri": [{"parametro_id": "c9000000-0000-0000-0000-000000000021", "obbligatorio": false, "ordine": 0}]}]
  }'::jsonb),
  'e9000000-0000-0000-0000-000000000002'::uuid,
  'crea_esperimento: chi era lettore altrove crea il proprio esperimento');
select is(
  array[ruolo_in('e9000000-0000-0000-0000-000000000002'),
        (select count(*)::text from piante where esperimento_id = 'e9000000-0000-0000-0000-000000000002'),
        (select count(*)::text from strumento_parametri where esperimento_id = 'e9000000-0000-0000-0000-000000000002')],
  array['proprietario', '1', '1'],
  'crea_esperimento: ne e'' proprietario, con piante e strumenti');

-- ===== Catalogo: modificato_da e autori_catalogo =====
select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ insert into catalogo_strumenti (id, nome, modificato_da)
     values ('c8000000-0000-0000-0000-000000000001', 'Strumento dei ruoli', '09000000-0000-0000-0000-00000000000a') $$,
  'catalogo: R crea una voce (provando a firmarla come modificata da P)');
select results_eq(
  $$ select creato_da, modificato_da from catalogo_strumenti where id = 'c8000000-0000-0000-0000-000000000001' $$,
  $$ values ('09000000-0000-0000-0000-00000000000b'::uuid, '09000000-0000-0000-0000-00000000000b'::uuid) $$,
  'catalogo: creata e modificata da R, chiunque dica il payload');

select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000c', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ update catalogo_strumenti set descrizione = 'Rivista' where id = 'c8000000-0000-0000-0000-000000000001' $$,
  'catalogo: L modifica la voce');
select results_eq(
  $$ select creato_da, modificato_da from catalogo_strumenti where id = 'c8000000-0000-0000-0000-000000000001' $$,
  $$ values ('09000000-0000-0000-0000-00000000000b'::uuid, '09000000-0000-0000-0000-00000000000c'::uuid) $$,
  'catalogo: modificato_da e'' l''ultimo che l''ha modificata');
select throws_ok(
  $$ update catalogo_strumenti set modificato_da = '09000000-0000-0000-0000-00000000000a'
      where id = 'c8000000-0000-0000-0000-000000000001' $$,
  '42501', null,
  'catalogo: modificato_da non si scrive a mano');

select set_config('request.jwt.claims',
  json_build_object('sub', '09000000-0000-0000-0000-00000000000d', 'role', 'authenticated')::text, true);
select results_eq(
  $$ select utente_id, email from autori_catalogo() $$,
  $$ values ('09000000-0000-0000-0000-00000000000c'::uuid, 'l.ruoli@test.it'::text),
            ('09000000-0000-0000-0000-00000000000b'::uuid, 'r.ruoli@test.it'::text) $$,
  'autori_catalogo: chi ha creato e chi ha modificato le voci, per ogni utente registrato');

-- ===== anon =====
reset role;
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
select throws_ok($$ select autori_catalogo() $$, '42501', null, 'anon non legge gli autori del catalogo');
select throws_ok($$ select * from membri_di('e9000000-0000-0000-0000-000000000001') $$, '42501', null, 'anon non legge i membri');
select throws_ok(
  $$ select aggiungi_membro('e9000000-0000-0000-0000-000000000001', 'x.ruoli@test.it', 'proprietario') $$,
  '42501', null,
  'anon non aggiunge membri');
select throws_ok($$ select ruolo_in('e9000000-0000-0000-0000-000000000001') $$, '42501', null, 'anon non chiede ruoli');

reset role;
select * from finish();
rollback;
