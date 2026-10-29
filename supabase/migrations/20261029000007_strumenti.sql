-- FastLab v3, Piano A: le passate diventano strumenti.
--
-- Il concetto resta lo stesso (un gruppo di parametri misurati insieme), cambiano nome e
-- regole:
-- 1. passate -> strumenti, passata_parametri -> strumento_parametri, passata_id ->
--    strumento_id. Si rinominano anche vincoli, indici e policy, cosi' nessun messaggio
--    d'errore e nessun nome nel database cita piu' le passate.
-- 2. strumenti.tipo ('strumento' | 'fenologico'): al massimo una tabella fenologica per
--    esperimento. strumenti.archiviato: uno strumento con misure non si elimina, si archivia.
-- 3. Un parametro appartiene a un solo strumento.
--
-- Trigger (guardia_esperimento_id), policy, RLS e privilegi seguono la tabella e la colonna
-- rinominate; la funzione crea_esperimento invece cita le tabelle per nome e va riscritta.

-- ===== 1. Rinomine =====
alter table passate rename to strumenti;
alter table passata_parametri rename to strumento_parametri;
alter table strumento_parametri rename column passata_id to strumento_id;
alter table misure rename column passata_id to strumento_id;

-- Rinominare un vincolo primary key o unique rinomina anche il suo indice.
alter table strumenti rename constraint passate_pkey to strumenti_pkey;
alter table strumenti rename constraint passate_id_esperimento_id_key to strumenti_id_esperimento_id_key;
alter table strumenti rename constraint passate_esperimento_id_fkey to strumenti_esperimento_id_fkey;
-- L'indice della chiave primaria conserva il nome della colonna di quando e' stato creato
-- (passata_id) anche dopo la rinomina: la chiave si ricrea. Nessuna FK punta a questa tabella.
alter table strumento_parametri
  drop constraint passata_parametri_pkey,
  add constraint strumento_parametri_pkey primary key (strumento_id, parametro_id);
alter table strumento_parametri
  rename constraint passata_parametri_esperimento_id_fkey to strumento_parametri_esperimento_id_fkey;
alter table strumento_parametri
  rename constraint passata_parametri_passata_id_esperimento_id_fkey to strumento_parametri_strumento_id_esperimento_id_fkey;
alter table strumento_parametri
  rename constraint passata_parametri_parametro_id_esperimento_id_fkey to strumento_parametri_parametro_id_esperimento_id_fkey;
alter table misure rename constraint misure_passata_id_esperimento_id_fkey to misure_strumento_id_esperimento_id_fkey;

alter policy passate_membro on strumenti rename to strumenti_membro;
alter policy passata_parametri_membro on strumento_parametri rename to strumento_parametri_membro;

-- Il grant per colonna su misure (20261028000005) segue la colonna rinominata; lo si
-- riscrive comunque per intero, cosi' l'elenco valido e' leggibile qui: tutte le colonne
-- tranne creato_da. Una colonna aggiunta in futuro va aggiunta anche qui.
revoke update on table misure from authenticated;
grant update (id, esperimento_id, pianta_id, strumento_id, data_rilievo, ora, valori, creato_il, aggiornato_il)
  on table misure to authenticated;

-- ===== 2. Tipo e archiviato =====
alter table strumenti
  add column tipo text not null default 'strumento' check (tipo in ('strumento', 'fenologico')),
  add column archiviato boolean not null default false;

create unique index strumenti_un_fenologico on strumenti (esperimento_id) where tipo = 'fenologico';

-- ===== 3. Un parametro in un solo strumento =====
-- Nel Piano 1 un parametro poteva stare in piu' passate (il modello Hydrochar metteva Altezza
-- sia in "Altezza" sia in "Fenologici"). Non si sceglie qui quale collegamento togliere:
-- se ci sono doppioni la migration si ferma con un messaggio chiaro.
do $$
begin
  if exists (select 1 from public.strumento_parametri group by parametro_id having count(*) > 1) then
    raise exception 'PARAMETRO_IN_PIU_STRUMENTI: togliere i doppioni da strumento_parametri prima di questa migration';
  end if;
end
$$;

create unique index strumento_parametri_un_solo_strumento on strumento_parametri (parametro_id);

-- ===== RPC =====
-- Crea un esperimento completo da una BozzaEsperimento serializzata (src/domain/tipi.ts):
-- esperimento, fattori[].livelli[], trattamenti[].livello_ids, piante, parametri,
-- strumenti[].parametri[]. Gli id sono quelli della bozza (generati dal client) e ogni riga
-- figlia prende esperimento_id = bozza.esperimento.id. Una chiamata e' un solo statement:
-- se un insert fallisce non resta nulla. tipo e archiviato degli strumenti prendono i
-- default se la bozza non li porta.
create or replace function crea_esperimento(bozza jsonb) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := (bozza -> 'esperimento' ->> 'id')::uuid;
begin
  -- creato_da prende il default auth.uid(); il trigger aggiunge il proprietario ai membri,
  -- cosi' gli insert successivi passano da is_membro. values inserisce sempre una riga:
  -- una bozza senza esperimento fallisce sul not null invece di non creare nulla.
  insert into public.esperimenti (id, nome, data_inizio, note, stato)
  values (v_id,
          bozza -> 'esperimento' ->> 'nome',
          (bozza -> 'esperimento' ->> 'data_inizio')::date,
          coalesce(bozza -> 'esperimento' ->> 'note', ''),
          coalesce(bozza -> 'esperimento' ->> 'stato', 'in_corso'));

  insert into public.fattori (id, esperimento_id, nome, ordine)
  select f.id, v_id, f.nome, f.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'fattori', '[]')) as f (id uuid, nome text, ordine int);

  insert into public.livelli (id, esperimento_id, fattore_id, nome, ordine)
  select l.id, v_id, f.id, l.nome, l.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'fattori', '[]')) as f (id uuid, livelli jsonb),
         jsonb_to_recordset(coalesce(f.livelli, '[]')) as l (id uuid, nome text, ordine int);

  insert into public.trattamenti (id, esperimento_id, etichetta, ordine)
  select t.id, v_id, t.etichetta, t.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'trattamenti', '[]')) as t (id uuid, etichetta text, ordine int);

  insert into public.trattamento_livelli (esperimento_id, trattamento_id, livello_id)
  select v_id, t.id, tl.livello_id::uuid
    from jsonb_to_recordset(coalesce(bozza -> 'trattamenti', '[]')) as t (id uuid, livello_ids jsonb),
         jsonb_array_elements_text(coalesce(t.livello_ids, '[]')) as tl (livello_id);

  insert into public.piante (id, esperimento_id, trattamento_id, etichetta, blocco, ordine)
  select p.id, v_id, p.trattamento_id, p.etichetta, p.blocco, p.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'piante', '[]'))
         as p (id uuid, trattamento_id uuid, etichetta text, blocco text, ordine int);

  insert into public.parametri (id, esperimento_id, nome, unita, tipo, ordine, archiviato, progressivo,
                                ricorda_tra_piante, n_letture, valore_min, valore_max, sotto_campi)
  select p.id, v_id, p.nome, p.unita, p.tipo, p.ordine,
         coalesce(p.archiviato, false), coalesce(p.progressivo, false), coalesce(p.ricorda_tra_piante, false),
         coalesce(p.n_letture, 1), p.valore_min, p.valore_max, coalesce(p.sotto_campi, '[]')
    from jsonb_to_recordset(coalesce(bozza -> 'parametri', '[]'))
         as p (id uuid, nome text, unita text, tipo text, ordine int, archiviato boolean, progressivo boolean,
               ricorda_tra_piante boolean, n_letture int, valore_min numeric, valore_max numeric,
               sotto_campi jsonb);

  insert into public.strumenti (id, esperimento_id, nome, icona, ordine, tipo, archiviato)
  select s.id, v_id, s.nome, s.icona, s.ordine, coalesce(s.tipo, 'strumento'), coalesce(s.archiviato, false)
    from jsonb_to_recordset(coalesce(bozza -> 'strumenti', '[]'))
         as s (id uuid, nome text, icona text, ordine int, tipo text, archiviato boolean);

  insert into public.strumento_parametri (esperimento_id, strumento_id, parametro_id, obbligatorio, ordine)
  select v_id, s.id, sp.parametro_id, coalesce(sp.obbligatorio, false), sp.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'strumenti', '[]')) as s (id uuid, parametri jsonb),
         jsonb_to_recordset(coalesce(s.parametri, '[]'))
         as sp (parametro_id uuid, obbligatorio boolean, ordine int);

  return v_id;
end
$$;

revoke execute on function crea_esperimento(jsonb) from public, anon;
grant execute on function crea_esperimento(jsonb) to authenticated;
