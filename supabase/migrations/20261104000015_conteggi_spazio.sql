-- FastLab v3, Piano E (Task E4): conteggi degli strumenti e spazio del progetto.
--
-- 1. conteggi_strumenti: per ogni strumento misurato dell'esperimento quante misure, di quante piante,
--    la prima e l'ultima data, in una sola lettura. Prende il posto di strumentiConDati nel client, che
--    scaricava tutti gli strumento_id delle misure a pagine. Decide se "Elimina strumento" elimina o
--    spiega perche' non si puo'.
-- 2. parametri_con_dati: stessa firma e stesso risultato della 20261028000004, ma in un solo passaggio
--    sulle misure dell'esperimento invece di un exists per parametro.
-- 3. spazio_progetto: quanto occupano il database e le foto di tutto il progetto (solo totali) e, per
--    chi e' membro, i conteggi dell'esperimento.
--
-- Nessuna tabella nuova. Funzioni con search_path vuoto, niente per anon.

-- ===== 1. Conteggi degli strumenti =====
-- security invoker: la RLS delle misure fa il resto, chi non e' membro riceve zero righe. Solo gli
-- strumenti con almeno una misura; il group by usa l'indice misure (esperimento_id, strumento_id, id)
-- della 20261102000014.
create function conteggi_strumenti(p_esperimento uuid)
returns table (strumento_id uuid, misure bigint, piante bigint, prima date, ultima date)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.strumento_id, count(*), count(distinct m.pianta_id), min(m.data_rilievo), max(m.data_rilievo)
    from public.misure m
   where m.esperimento_id = p_esperimento
   group by m.strumento_id
$$;

revoke execute on function conteggi_strumenti(uuid) from public, anon;
grant execute on function conteggi_strumenti(uuid) to authenticated;

-- ===== 2. Parametri con dati, in un passaggio =====
-- Si raccolgono una volta le chiavi di tutte le misure dell'esperimento, poi si confrontano con i suoi
-- parametri. Le chiavi sono quelle che l'operatore `valori ? id` della versione di prima (e di
-- guardia_parametri, che resta com'e') riconosce: le chiavi di un oggetto, le stringhe in cima a un
-- array e una stringa da sola. L'app scrive sempre un oggetto; gli altri due casi ci sono perche' il
-- risultato non cambi su nessuna riga, e perche' jsonb_object_keys su un array andrebbe in errore.
-- `create or replace` tiene la firma e i privilegi (revoke da anon, grant ad authenticated).
create or replace function parametri_con_dati(p_esperimento uuid) returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id
    from public.parametri p
   where p.esperimento_id = p_esperimento
     and p.id::text in (
       select k.chiave
         from public.misure m
        cross join lateral (
          select o.chiave
            from jsonb_object_keys(case jsonb_typeof(m.valori) when 'object' then m.valori else '{}'::jsonb end) as o (chiave)
          union all
          select e.valore #>> '{}'
            from jsonb_array_elements(case jsonb_typeof(m.valori) when 'array' then m.valori else '[]'::jsonb end) as e (valore)
           where jsonb_typeof(e.valore) = 'string'
          union all
          select m.valori #>> '{}' where jsonb_typeof(m.valori) = 'string'
        ) as k (chiave)
        where m.esperimento_id = p_esperimento
     )
$$;

-- ===== 3. Spazio del progetto =====
-- Il piano gratuito di Supabase ha due limiti per l'intero progetto (500 MB di database, 1 GB di
-- Storage), condivisi da tutti gli esperimenti di tutti gli utenti: per sapere quanto manca servono
-- anche i numeri degli esperimenti di cui non si e' membri. Per questo security definer, e per questo
-- restituisce solo numeri: nessun nome di file, di esperimento o di utente.
--
-- Forma:
--   {"database_byte": 41234567, "foto_byte": 210000000,
--    "esperimento": {"misure": 3120, "note": 14, "foto": 85, "dati_byte": 1830000, "foto_byte": 29000000}}
-- - database_byte: pg_database_size del database (tabelle, indici e sistema di Supabase);
-- - foto_byte: i byte dei file del bucket foto, di tutti gli esperimenti (anche i file senza riga);
-- - esperimento: null se chi chiama non e' membro (anche per un id che non esiste). Altrimenti le
--   misure, le note, le foto con il file (le archiviate no: il file non c'e' piu'), i byte stimati
--   delle loro righe (pg_column_size) e i byte dei file nella cartella dell'esperimento.
-- Senza sessione (auth.uid() null) restituisce null.
--
-- Ripiego: su Supabase storage.objects e' del servizio Storage (supabase_storage_admin) e ha la RLS
-- attiva. Se il proprietario di questa funzione non avesse bypassrls, le policy (solo per
-- authenticated) gli nasconderebbero ogni riga e la somma sarebbe zero; senza il privilegio di select
-- la lettura andrebbe in errore. In entrambi i casi vale la somma da public.foto (byte delle foto non
-- archiviate), che e' tabella del proprietario della funzione: si prende il maggiore dei due numeri,
-- cosi' un totale che lo Storage non dice non diventa mai zero. Di norma lo Storage ha il numero
-- maggiore (conta anche i file senza riga). Il Task E13 (miniature) aggiunge qui byte_miniatura.
create function spazio_progetto(p_esperimento uuid) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_righe bigint;
  v_righe_esp bigint;
  v_storage bigint := 0;
  v_storage_esp bigint := 0;
  v_esperimento jsonb;
begin
  if (select auth.uid()) is null then
    return null;
  end if;

  select coalesce(sum(f.byte), 0),
         coalesce(sum(f.byte) filter (where f.esperimento_id = p_esperimento), 0)
    into v_righe, v_righe_esp
    from public.foto f
   where not f.archiviata;

  begin
    -- size e' un numero nei metadati che scrive il servizio Storage; un valore di altro tipo non conta.
    -- La cartella di un esperimento e' il suo id: un uuid non ha caratteri speciali per like.
    select coalesce(sum((o.metadata ->> 'size')::numeric), 0)::bigint,
           coalesce(sum((o.metadata ->> 'size')::numeric)
             filter (where o.name like p_esperimento::text || '/%'), 0)::bigint
      into v_storage, v_storage_esp
      from storage.objects o
     where o.bucket_id = 'foto'
       and jsonb_typeof(o.metadata -> 'size') = 'number';
  exception when insufficient_privilege then
    v_storage := 0;
    v_storage_esp := 0;
  end;

  if public.is_membro(p_esperimento) then
    v_esperimento := jsonb_build_object(
      'misure', (select count(*) from public.misure m where m.esperimento_id = p_esperimento),
      'note', (select count(*) from public.note n where n.esperimento_id = p_esperimento),
      'foto', (select count(*) from public.foto f where f.esperimento_id = p_esperimento and not f.archiviata),
      'dati_byte',
        (select coalesce(sum(pg_column_size(m.*)), 0) from public.misure m where m.esperimento_id = p_esperimento)
        + (select coalesce(sum(pg_column_size(n.*)), 0) from public.note n where n.esperimento_id = p_esperimento)
        + (select coalesce(sum(pg_column_size(f.*)), 0) from public.foto f where f.esperimento_id = p_esperimento),
      'foto_byte', greatest(v_storage_esp, v_righe_esp)
    );
  end if;

  return jsonb_build_object(
    'database_byte', pg_database_size(current_database()),
    'foto_byte', greatest(v_storage, v_righe),
    'esperimento', v_esperimento
  );
end
$$;

revoke execute on function spazio_progetto(uuid) from public, anon;
grant execute on function spazio_progetto(uuid) to authenticated;
