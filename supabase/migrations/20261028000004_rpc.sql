-- FastLab v3: RPC. Tutte security invoker, quindi passano dalle policy RLS di chi chiama;
-- eseguibili solo da authenticated.

-- Crea un esperimento completo da una BozzaEsperimento serializzata (src/domain/tipi.ts):
-- esperimento, fattori[].livelli[], trattamenti[].livello_ids, piante, parametri,
-- passate[].parametri[]. Gli id sono quelli della bozza (generati dal client) e ogni riga
-- figlia prende esperimento_id = bozza.esperimento.id. Una chiamata e' un solo statement:
-- se un insert fallisce non resta nulla.
create function crea_esperimento(bozza jsonb) returns uuid
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

  insert into public.passate (id, esperimento_id, nome, icona, ordine)
  select pa.id, v_id, pa.nome, pa.icona, pa.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'passate', '[]')) as pa (id uuid, nome text, icona text, ordine int);

  insert into public.passata_parametri (esperimento_id, passata_id, parametro_id, obbligatorio, ordine)
  select v_id, pa.id, pp.parametro_id, coalesce(pp.obbligatorio, false), pp.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'passate', '[]')) as pa (id uuid, parametri jsonb),
         jsonb_to_recordset(coalesce(pa.parametri, '[]'))
         as pp (parametro_id uuid, obbligatorio boolean, ordine int);

  return v_id;
end
$$;

-- Elenco degli esperimenti visibili, dal piu' recente. ultima_data e' l'ultima data di
-- rilievo; piante_ultima_data conta le piante distinte con almeno una misura in quella data.
create function riepilogo_esperimenti()
returns table (id uuid, nome text, stato text, data_inizio date, n_piante int, n_trattamenti int,
               ultima_data date, piante_ultima_data int)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.id, e.nome, e.stato, e.data_inizio,
         (select count(*)::int from public.piante p where p.esperimento_id = e.id),
         (select count(*)::int from public.trattamenti t where t.esperimento_id = e.id),
         u.ultima_data,
         (select count(distinct m.pianta_id)::int from public.misure m
           where m.esperimento_id = e.id and m.data_rilievo = u.ultima_data)
    from public.esperimenti e
   cross join lateral (
     select max(m.data_rilievo) as ultima_data from public.misure m where m.esperimento_id = e.id
   ) u
   order by e.creato_il desc, e.id
$$;

-- Parametri dell'esperimento che compaiono come chiave in almeno una misura: sono quelli
-- che non si possono eliminare (stesso controllo di guardia_parametri).
create function parametri_con_dati(p_esperimento uuid) returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id from public.parametri p
   where p.esperimento_id = p_esperimento
     and exists (
       select 1 from public.misure m
        where m.esperimento_id = p.esperimento_id
          and m.valori ? p.id::text
     )
$$;

-- Piante dell'esperimento con almeno una misura.
create function piante_con_dati(p_esperimento uuid) returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct m.pianta_id from public.misure m where m.esperimento_id = p_esperimento
$$;

revoke execute on function crea_esperimento(jsonb) from public, anon;
revoke execute on function riepilogo_esperimenti() from public, anon;
revoke execute on function parametri_con_dati(uuid) from public, anon;
revoke execute on function piante_con_dati(uuid) from public, anon;
grant execute on function crea_esperimento(jsonb) to authenticated;
grant execute on function riepilogo_esperimenti() to authenticated;
grant execute on function parametri_con_dati(uuid) to authenticated;
grant execute on function piante_con_dati(uuid) to authenticated;
