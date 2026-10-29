-- La data dell'ultima misura di ogni strumento di un esperimento, per la pagina "Scegli lo strumento"
-- ("ultima volta 21/10"). Una riga per strumento con almeno una misura; gli strumenti mai misurati non compaiono.
-- Security invoker: la RLS di misure resta quella di chi chiama, quindi un non membro non vede nulla.
create function ultime_misure_per_strumento(p_esperimento uuid) returns table (strumento_id uuid, ultima date)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.strumento_id, max(m.data_rilievo)
    from public.misure m
   where m.esperimento_id = p_esperimento
   group by m.strumento_id
$$;

revoke execute on function ultime_misure_per_strumento(uuid) from public, anon;
grant execute on function ultime_misure_per_strumento(uuid) to authenticated;
