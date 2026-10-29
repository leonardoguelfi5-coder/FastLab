-- FastLab v3, Piano A: catalogo strumenti condiviso.
--
-- Il catalogo e' l'unica tabella condivisa tra tutti gli utenti: ogni voce e' uno strumento
-- (SPAD, Termometro, Ciras…) con i suoi valori. Un esperimento non usa la voce direttamente:
-- ne copia lo strumento e i parametri, che restano collegati con strumenti.catalogo_id e
-- parametri.catalogo_chiave (per aggiornare in seguito le proprie copie dal catalogo).
-- 1. catalogo_strumenti: lettura, inserimento e aggiornamento per authenticated; nessun
--    delete (le voci si archiviano); niente per anon; creato_da non aggiornabile.
-- 2. I semi: le voci di partenza, con id fissi e senza autore.
-- 3. I collegamenti negli esperimenti e crea_esperimento che li legge dalla bozza.

-- ===== 1. Tabella =====
-- parametri: array di {chiave, nome, unita, n_letture, valore_min, valore_max}. La chiave
-- identifica il valore dentro la voce (diventa parametri.catalogo_chiave nelle copie).
create table catalogo_strumenti (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> ''),
  icona text,
  descrizione text not null default '',
  parametri jsonb not null default '[]'
    constraint catalogo_strumenti_parametri_array check (jsonb_typeof(parametri) = 'array'),
  archiviato boolean not null default false,
  creato_da uuid references auth.users (id) default auth.uid(),
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);

-- Due voci attive con lo stesso nome (senza badare a spazi e maiuscole) confonderebbero la
-- scelta: si rifiutano. Una voce archiviata libera il nome. Il nome dell'indice e' quello che
-- l'app riconosce nel 23505 (src/lib/errori.ts).
create unique index catalogo_strumenti_nome_unico on catalogo_strumenti (lower(btrim(nome))) where not archiviato;

create trigger catalogo_strumenti_aggiornato_il
  before update on catalogo_strumenti
  for each row execute function public.imposta_aggiornato_il();

alter table catalogo_strumenti enable row level security;

-- Il catalogo e' di tutti: ogni utente autenticato legge e modifica ogni voce. Chi inserisce
-- firma la voce con se stesso (nessuno la firma a nome di altri).
create policy catalogo_strumenti_select on catalogo_strumenti
  for select to authenticated using (true);
create policy catalogo_strumenti_insert on catalogo_strumenti
  for insert to authenticated with check (creato_da = (select auth.uid()));
create policy catalogo_strumenti_update on catalogo_strumenti
  for update to authenticated using (true) with check (true);

-- Privilegi: Supabase concede tutto ad anon e authenticated per default. anon non serve;
-- delete non c'e' (nessuna policy e nessun privilegio: le voci si archiviano); truncate,
-- references e trigger non passano da RLS. creato_da non si cambia dopo l'insert: come in
-- 20261028000005 si toglie l'update sulla tabella e lo si concede sulle altre colonne,
-- comprese id e aggiornato_il perche' l'upsert di PostgREST mette nel SET tutte le colonne
-- del payload. Una colonna aggiunta in futuro va aggiunta anche qui.
revoke all on table catalogo_strumenti from anon;
revoke delete, truncate, references, trigger on table catalogo_strumenti from authenticated;
revoke update on table catalogo_strumenti from authenticated;
grant update (id, nome, icona, descrizione, parametri, archiviato, creato_il, aggiornato_il)
  on table catalogo_strumenti to authenticated;

-- ===== 2. Semi =====
-- Id fissi e leggibili, cosi' i test e i modelli li possono citare; creato_da null: non sono
-- di nessun utente. Ogni valore ha una lettura e nessun limite.
insert into catalogo_strumenti (id, nome, icona, descrizione, parametri, creato_da) values
  ('c0000000-0000-0000-0000-000000000001', 'SPAD', '💚', 'Contenuto di clorofilla della foglia.',
   '[{"chiave": "spad", "nome": "SPAD", "unita": null, "n_letture": 1, "valore_min": null, "valore_max": null}]',
   null),
  ('c0000000-0000-0000-0000-000000000002', 'Termometro', '🌡', 'Temperatura dell''aria e della pianta.',
   '[{"chiave": "temp_aria", "nome": "Temp aria", "unita": "°C", "n_letture": 1, "valore_min": null, "valore_max": null},
     {"chiave": "temp_pianta", "nome": "Temp pianta", "unita": "°C", "n_letture": 1, "valore_min": null, "valore_max": null}]',
   null),
  ('c0000000-0000-0000-0000-000000000003', 'Ciras', '🍃', 'Scambi gassosi della foglia.',
   '[{"chiave": "a", "nome": "A", "unita": "µmol m⁻² s⁻¹", "n_letture": 1, "valore_min": null, "valore_max": null},
     {"chiave": "gs", "nome": "gs", "unita": "mol m⁻² s⁻¹", "n_letture": 1, "valore_min": null, "valore_max": null},
     {"chiave": "e", "nome": "E", "unita": "mmol m⁻² s⁻¹", "n_letture": 1, "valore_min": null, "valore_max": null},
     {"chiave": "ci", "nome": "Ci", "unita": "µmol mol⁻¹", "n_letture": 1, "valore_min": null, "valore_max": null}]',
   null),
  ('c0000000-0000-0000-0000-000000000004', 'Metro', '📏', 'Altezza della pianta.',
   '[{"chiave": "altezza", "nome": "Altezza", "unita": "cm", "n_letture": 1, "valore_min": null, "valore_max": null}]',
   null),
  ('c0000000-0000-0000-0000-000000000005', 'Calibro', '📐', 'Diametro del fusto.',
   '[{"chiave": "diametro", "nome": "Diametro", "unita": "mm", "n_letture": 1, "valore_min": null, "valore_max": null}]',
   null);

-- ===== 3. Collegamenti negli esperimenti =====
-- Facoltativi: uno strumento creato a mano non viene dal catalogo, un parametro aggiunto a
-- mano non ha chiave. Le voci non si eliminano, quindi il riferimento non resta mai appeso.
-- strumenti e parametri hanno l'update sull'intera tabella: le colonne nuove si aggiornano.
alter table strumenti add column catalogo_id uuid references catalogo_strumenti (id);
alter table parametri add column catalogo_chiave text;

-- crea_esperimento come nella migration 0008, con strumenti[].catalogo_id e
-- parametri[].catalogo_chiave (null se la bozza non li porta).
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
                                n_letture, valore_min, valore_max, sotto_campi, catalogo_chiave)
  select p.id, v_id, p.nome, p.unita, p.tipo, p.ordine,
         coalesce(p.archiviato, false), coalesce(p.progressivo, false),
         coalesce(p.n_letture, 1), p.valore_min, p.valore_max, coalesce(p.sotto_campi, '[]'), p.catalogo_chiave
    from jsonb_to_recordset(coalesce(bozza -> 'parametri', '[]'))
         as p (id uuid, nome text, unita text, tipo text, ordine int, archiviato boolean, progressivo boolean,
               n_letture int, valore_min numeric, valore_max numeric,
               sotto_campi jsonb, catalogo_chiave text);

  insert into public.strumenti (id, esperimento_id, nome, icona, ordine, tipo, archiviato, catalogo_id)
  select s.id, v_id, s.nome, s.icona, s.ordine, coalesce(s.tipo, 'strumento'), coalesce(s.archiviato, false),
         s.catalogo_id
    from jsonb_to_recordset(coalesce(bozza -> 'strumenti', '[]'))
         as s (id uuid, nome text, icona text, ordine int, tipo text, archiviato boolean, catalogo_id uuid);

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
