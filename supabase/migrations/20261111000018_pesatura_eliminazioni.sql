-- Pesatura: un rilevatore non elimina i pesi degli altri.
-- Eliminare una sessione o un campione porta via a cascata tutti i suoi pesi, anche quelli inseriti da altre
-- persone. Il rilevatore corregge ed elimina solo i propri pesi (policy pesi_delete in 20261111000017), quindi
-- elimina la propria sessione, o un suo campione, solo se non contiene pesi altrui. Il proprietario elimina tutto.

-- Security definer come puo_gestire_sessione: guarda tutti i pesi, senza passare dalla RLS.
create function ha_pesi_altrui_sessione(p_sessione uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pesi p
     where p.sessione_id = p_sessione and p.creato_da is distinct from (select auth.uid())
  )
$$;

create function ha_pesi_altrui_campione(p_campione uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pesi p
     where p.campione_id = p_campione and p.creato_da is distinct from (select auth.uid())
  )
$$;

revoke execute on function ha_pesi_altrui_sessione(uuid) from public, anon;
revoke execute on function ha_pesi_altrui_campione(uuid) from public, anon;
grant execute on function ha_pesi_altrui_sessione(uuid) to authenticated;
grant execute on function ha_pesi_altrui_campione(uuid) to authenticated;

drop policy sessioni_pesatura_delete on sessioni_pesatura;
create policy sessioni_pesatura_delete on sessioni_pesatura
  for delete to authenticated
  using (public.puo_configurare(esperimento_id)
         or (public.puo_gestire_sessione(id) and not public.ha_pesi_altrui_sessione(id)));

drop policy campioni_pesatura_delete on campioni_pesatura;
create policy campioni_pesatura_delete on campioni_pesatura
  for delete to authenticated
  using (public.puo_configurare(esperimento_id)
         or (public.puo_gestire_sessione(sessione_id) and not public.ha_pesi_altrui_campione(id)));
