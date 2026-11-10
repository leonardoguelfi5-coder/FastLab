-- Le misure piu' recenti di ogni pianta per ogni strumento, per la scheda della pianta, l'elenco per trattamento e
-- "Oggi". Per ogni coppia (pianta, strumento) restituisce TUTTE le misure della data piu' recente: due misure dello
-- stesso giorno tornano entrambe, cosi' il client puo' fare la media giornaliera. Le coppie mai misurate non compaiono.
-- Security invoker: la RLS di misure resta quella di chi chiama, quindi un non membro non vede nulla.
create function ultime_misure_piante(p_esperimento uuid) returns setof public.misure
language sql
stable
security invoker
set search_path = ''
as $$
  select m.*
    from public.misure m
   where m.esperimento_id = p_esperimento
     and (m.pianta_id, m.strumento_id, m.data_rilievo) in (
       select u.pianta_id, u.strumento_id, max(u.data_rilievo)
         from public.misure u
        where u.esperimento_id = p_esperimento
        group by u.pianta_id, u.strumento_id
     )
   order by m.pianta_id, m.strumento_id, m.data_rilievo, m.ora
$$;

revoke execute on function ultime_misure_piante(uuid) from public, anon;
grant execute on function ultime_misure_piante(uuid) to authenticated;
