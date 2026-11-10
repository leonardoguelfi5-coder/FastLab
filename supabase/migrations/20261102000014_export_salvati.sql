-- FastLab v3, Piano D (Task D1): gli export salvati, per esperimento e per utente.
--
-- 1. scelte_export_valide: la forma fissa (versione 1) delle scelte di un export, controllata in un
--    check. La gemella nel client e' leggiSceltaExport (src/domain/export/scelte.ts), con gli stessi
--    casi di prova (supabase/tests/export_salvati.test.sql).
-- 2. export_salvati: nome e scelte. Ogni utente vede e tocca solo i suoi, e solo negli esperimenti di
--    cui e' membro: un collega dello stesso esperimento non li vede (spec §7.5). "Tutto
--    l'esperimento" non e' una riga: e' una costante del client.
-- 3. L'indice di misure per leggere le misure di uno strumento a pagine keyset per id (Task D3).
--
-- Come le altre tabelle: id dal client (upsert per id), guardia_esperimento_id, RLS, niente per anon,
-- creato_da non aggiornabile e, all'insert, solo quello di chi scrive.

-- ===== 1. La forma delle scelte =====
-- Versione 1, un oggetto con esattamente queste chiavi (nessuna in piu', nessuna in meno):
--   {"v": 1,
--    "strumenti": {"modo": "tutti"} | {"modo": "scelti", "ids": [uuid, ...]},
--    "piante":    {"modo": "tutte"} | {"modo": "trattamenti", "ids": [uuid, ...]} | {"modo": "piante", "ids": [uuid, ...]},
--    "periodo":   {"modo": "tutto"} | {"modo": "settimane", "n": 4} | {"modo": "intervallo", "da": "AAAA-MM-GG", "a": "AAAA-MM-GG"},
--    "come":      {"valori": bool, "medie": bool, "grafici": bool, "diario": bool, "info": bool}}
-- Regole:
-- - v e' il numero 1;
-- - ids: array di stringhe uuid in minuscolo (come le scrivono Postgres e nuovoId()), senza doppioni,
--   da 1 a 200 elementi per gli strumenti e da 1 a 2000 per trattamenti e piante;
-- - n: numero intero da 1 a 104 (4,5 no, "4" come testo no);
-- - da e a: stringhe AAAA-MM-GG che sono date vere (2026-02-30 no, l'anno 0000 no), con da <= a;
-- - come: i cinque booleani veri (non "si'", non 1), almeno uno vero;
-- - tutto il testo al piu' 100 000 byte (il massimo legittimo, 2200 uuid, e' sotto i 90 000).
-- Gli ids non si confrontano con l'esperimento: una pianta eliminata dopo non deve rendere invalida
-- la riga. Li scarta il client in lettura (applicaAllaConfigurazione) e lo dice.
--
-- Non va mai in errore: per ogni forma sbagliata, e per null, restituisce false (il check allora
-- risponde 23514). Il blocco exception e' l'ultima rete (per esempio make_date di una data
-- impossibile); i controlli di tipo vengono prima, cosi' nessuna funzione riceve un valore del tipo
-- sbagliato. immutable: dipende solo dall'argomento (make_date e le regex non leggono impostazioni).
create function scelte_export_valide(s jsonb) returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  data_re constant text := '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
  x jsonb;
  ids jsonb;
  massimo int;
  n numeric;
  da date;
  a date;
begin
  if s is null or jsonb_typeof(s) is distinct from 'object' then
    return false;
  end if;
  -- Prima di tutto la dimensione: un oggetto enorme non si legge chiave per chiave.
  if octet_length(s::text) > 100000 then
    return false;
  end if;
  if array(select jsonb_object_keys(s) order by 1) <> array['come', 'periodo', 'piante', 'strumenti', 'v'] then
    return false;
  end if;

  -- Un if per controllo: in SQL un `or` non garantisce l'ordine, e il cast va fatto solo su un numero.
  if jsonb_typeof(s -> 'v') is distinct from 'number' then
    return false;
  end if;
  if (s ->> 'v')::numeric <> 1 then
    return false;
  end if;

  -- I tre oggetti con un modo: ciascuno ha esattamente le chiavi del suo modo.
  x := s -> 'strumenti';
  if jsonb_typeof(x) is distinct from 'object' or jsonb_typeof(x -> 'modo') is distinct from 'string' then
    return false;
  end if;
  if x ->> 'modo' = 'tutti' then
    if array(select jsonb_object_keys(x) order by 1) <> array['modo'] then return false; end if;
  elsif x ->> 'modo' = 'scelti' then
    if array(select jsonb_object_keys(x) order by 1) <> array['ids', 'modo'] then return false; end if;
  else
    return false;
  end if;

  x := s -> 'piante';
  if jsonb_typeof(x) is distinct from 'object' or jsonb_typeof(x -> 'modo') is distinct from 'string' then
    return false;
  end if;
  if x ->> 'modo' = 'tutte' then
    if array(select jsonb_object_keys(x) order by 1) <> array['modo'] then return false; end if;
  elsif x ->> 'modo' in ('trattamenti', 'piante') then
    if array(select jsonb_object_keys(x) order by 1) <> array['ids', 'modo'] then return false; end if;
  else
    return false;
  end if;

  x := s -> 'periodo';
  if jsonb_typeof(x) is distinct from 'object' or jsonb_typeof(x -> 'modo') is distinct from 'string' then
    return false;
  end if;
  if x ->> 'modo' = 'tutto' then
    if array(select jsonb_object_keys(x) order by 1) <> array['modo'] then return false; end if;
  elsif x ->> 'modo' = 'settimane' then
    if array(select jsonb_object_keys(x) order by 1) <> array['modo', 'n'] then return false; end if;
    if jsonb_typeof(x -> 'n') is distinct from 'number' then return false; end if;
    n := (x ->> 'n')::numeric;
    if n <> trunc(n) or n < 1 or n > 104 then return false; end if;
  elsif x ->> 'modo' = 'intervallo' then
    if array(select jsonb_object_keys(x) order by 1) <> array['a', 'da', 'modo'] then return false; end if;
    if jsonb_typeof(x -> 'da') is distinct from 'string' or jsonb_typeof(x -> 'a') is distinct from 'string'
       or not (x ->> 'da') ~ data_re or not (x ->> 'a') ~ data_re then
      return false;
    end if;
    -- make_date va in errore su una data impossibile (o sull'anno 0): lo raccoglie l'exception.
    da := make_date(substr(x ->> 'da', 1, 4)::int, substr(x ->> 'da', 6, 2)::int, substr(x ->> 'da', 9, 2)::int);
    a := make_date(substr(x ->> 'a', 1, 4)::int, substr(x ->> 'a', 6, 2)::int, substr(x ->> 'a', 9, 2)::int);
    if da > a then return false; end if;
  else
    return false;
  end if;

  -- Gli ids, dove il modo li chiede (le chiavi sono gia' state controllate sopra).
  foreach x in array array[s -> 'strumenti', s -> 'piante'] loop
    continue when not x ? 'ids';
    ids := x -> 'ids';
    massimo := case when x ->> 'modo' = 'scelti' then 200 else 2000 end;
    if jsonb_typeof(ids) is distinct from 'array' then
      return false;
    end if;
    if jsonb_array_length(ids) < 1 or jsonb_array_length(ids) > massimo then
      return false;
    end if;
    if exists (select 1 from jsonb_array_elements(ids) e
                where jsonb_typeof(e) is distinct from 'string' or not (e #>> '{}') ~ uuid_re) then
      return false;
    end if;
    if (select count(distinct e) from jsonb_array_elements(ids) e) <> jsonb_array_length(ids) then
      return false;
    end if;
  end loop;

  x := s -> 'come';
  if jsonb_typeof(x) is distinct from 'object'
     or array(select jsonb_object_keys(x) order by 1) <> array['diario', 'grafici', 'info', 'medie', 'valori'] then
    return false;
  end if;
  if exists (select 1 from jsonb_each(x) c where jsonb_typeof(c.value) is distinct from 'boolean') then
    return false;
  end if;
  if not exists (select 1 from jsonb_each(x) c where c.value = 'true'::jsonb) then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end
$$;

-- authenticated serve: il check la valuta con i privilegi di chi scrive la riga.
revoke execute on function scelte_export_valide(jsonb) from public, anon;
grant execute on function scelte_export_valide(jsonb) to authenticated;

-- ===== 2. Export salvati =====
-- `id` e' generato dal client (upsert per id), quindi nessun default. creato_da va a cascata
-- sull'utente: gli export sono solo suoi, nessun altro li vede.
create table export_salvati (
  id uuid primary key,
  esperimento_id uuid not null references esperimenti (id) on delete cascade,
  nome text not null check (btrim(nome) <> '' and char_length(nome) <= 80),
  scelte jsonb not null constraint export_salvati_scelte_valide check (public.scelte_export_valide(scelte)),
  creato_da uuid not null default auth.uid() references auth.users (id) on delete cascade,
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);

-- Il nome e' unico per esperimento e utente, senza badare a maiuscole e spazi ai bordi (salvando
-- con un nome gia' usato il client chiede se sostituire). Serve anche alla lista dell'utente.
create unique index export_salvati_nome_unico on export_salvati (esperimento_id, creato_da, lower(btrim(nome)));
-- Per l'eliminazione a cascata di un utente.
create index export_salvati_creato_da_idx on export_salvati (creato_da);

create trigger export_salvati_aggiornato_il
  before update on export_salvati
  for each row execute function public.imposta_aggiornato_il();

create trigger guardia_esperimento_id before update of esperimento_id on export_salvati
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();

-- ===== RLS =====
-- Ogni operazione chiede entrambe le cose: membro dell'esperimento e autore della riga. Chi lascia
-- un esperimento non vede piu' i suoi export di li'. Un upsert con l'id di un export altrui fallisce
-- (42501) sulla policy di update.
alter table export_salvati enable row level security;

create policy export_salvati_select on export_salvati
  for select to authenticated
  using (public.is_membro(esperimento_id) and creato_da = (select auth.uid()));
create policy export_salvati_insert on export_salvati
  for insert to authenticated
  with check (public.is_membro(esperimento_id) and creato_da = (select auth.uid()));
create policy export_salvati_update on export_salvati
  for update to authenticated
  using (public.is_membro(esperimento_id) and creato_da = (select auth.uid()))
  with check (public.is_membro(esperimento_id) and creato_da = (select auth.uid()));
create policy export_salvati_delete on export_salvati
  for delete to authenticated
  using (public.is_membro(esperimento_id) and creato_da = (select auth.uid()));

-- Privilegi come in 20261101000012: niente per anon, per authenticated niente truncate, references e
-- trigger. L'update e' concesso colonna per colonna: l'upsert di PostgREST mette nel SET le colonne del
-- payload (id, esperimento_id, nome, scelte), creato_da e creato_il restano fuori. Una colonna
-- aggiunta in futuro va aggiunta anche qui.
revoke all on table export_salvati from anon;
revoke truncate, references, trigger on table export_salvati from authenticated;
revoke update on table export_salvati from authenticated;
grant update (id, esperimento_id, nome, scelte, aggiornato_il) on table export_salvati to authenticated;

-- ===== 3. Misure di uno strumento a pagine =====
-- Dataset ed Esporta leggono `esperimento_id = X and strumento_id = Y and id > <ultimo> order by id`.
create index misure_esperimento_strumento_id_idx on misure (esperimento_id, strumento_id, id);
