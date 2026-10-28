-- FastLab v3: accesso per membro dell'esperimento (Row Level Security).
--
-- Ogni esperimento ha i suoi membri; per ora solo il proprietario, ma la tabella
-- predispone la condivisione. Ogni tabella figlia si filtra con is_membro(esperimento_id):
-- chi non e' membro non legge, non scrive e non tocca nulla di quell'esperimento.
-- anon non ha alcun privilegio sulle tabelle.

create table membri_esperimento (
  esperimento_id uuid not null references esperimenti (id) on delete cascade,
  utente_id uuid not null references auth.users (id),
  ruolo text not null default 'proprietario' check (ruolo in ('proprietario', 'collaboratore')),
  primary key (esperimento_id, utente_id)
);

create index membri_esperimento_utente_idx on membri_esperimento (utente_id);

-- security definer: le policy la chiamano per ogni riga e membri_esperimento ha a sua
-- volta RLS; il risultato dipende solo dall'utente corrente.
create function is_membro(p uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membri_esperimento m
     where m.esperimento_id = p
       and m.utente_id = (select auth.uid())
  )
$$;

revoke execute on function is_membro(uuid) from public, anon;
grant execute on function is_membro(uuid) to authenticated;

-- Chi crea l'esperimento ne diventa proprietario. Si usa creato_da: sotto RLS la policy
-- di insert impone creato_da = auth.uid(), e cosi' funziona anche da service role.
create function aggiungi_proprietario() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.membri_esperimento (esperimento_id, utente_id, ruolo)
  values (new.id, new.creato_da, 'proprietario');
  return new;
end
$$;

revoke execute on function aggiungi_proprietario() from public, anon, authenticated;
revoke execute on function guardia_parametri() from public, anon, authenticated;

create trigger esperimenti_proprietario
  after insert on esperimenti
  for each row execute function aggiungi_proprietario();

-- RLS su tutte le tabelle
alter table esperimenti enable row level security;
alter table membri_esperimento enable row level security;
alter table fattori enable row level security;
alter table livelli enable row level security;
alter table trattamenti enable row level security;
alter table trattamento_livelli enable row level security;
alter table piante enable row level security;
alter table parametri enable row level security;
alter table passate enable row level security;
alter table passata_parametri enable row level security;
alter table misure enable row level security;

create policy esperimenti_select on esperimenti
  for select to authenticated using (public.is_membro(id));
create policy esperimenti_insert on esperimenti
  for insert to authenticated with check (creato_da = (select auth.uid()));
create policy esperimenti_update on esperimenti
  for update to authenticated using (public.is_membro(id)) with check (public.is_membro(id));
create policy esperimenti_delete on esperimenti
  for delete to authenticated using (public.is_membro(id));

create policy membri_esperimento_select on membri_esperimento
  for select to authenticated using (utente_id = (select auth.uid()));

create policy fattori_membro on fattori
  for all to authenticated
  using (public.is_membro(esperimento_id)) with check (public.is_membro(esperimento_id));
create policy livelli_membro on livelli
  for all to authenticated
  using (public.is_membro(esperimento_id)) with check (public.is_membro(esperimento_id));
create policy trattamenti_membro on trattamenti
  for all to authenticated
  using (public.is_membro(esperimento_id)) with check (public.is_membro(esperimento_id));
create policy trattamento_livelli_membro on trattamento_livelli
  for all to authenticated
  using (public.is_membro(esperimento_id)) with check (public.is_membro(esperimento_id));
create policy piante_membro on piante
  for all to authenticated
  using (public.is_membro(esperimento_id)) with check (public.is_membro(esperimento_id));
create policy parametri_membro on parametri
  for all to authenticated
  using (public.is_membro(esperimento_id)) with check (public.is_membro(esperimento_id));
create policy passate_membro on passate
  for all to authenticated
  using (public.is_membro(esperimento_id)) with check (public.is_membro(esperimento_id));
create policy passata_parametri_membro on passata_parametri
  for all to authenticated
  using (public.is_membro(esperimento_id)) with check (public.is_membro(esperimento_id));
create policy misure_membro on misure
  for all to authenticated
  using (public.is_membro(esperimento_id)) with check (public.is_membro(esperimento_id));

-- Privilegi: Supabase concede tutto ad anon e authenticated per default. anon non serve;
-- truncate, references e trigger non passano da RLS e il client non li usa.
revoke all on table
  esperimenti, membri_esperimento, fattori, livelli, trattamenti, trattamento_livelli,
  piante, parametri, passate, passata_parametri, misure
  from anon;
revoke truncate, references, trigger on table
  esperimenti, membri_esperimento, fattori, livelli, trattamenti, trattamento_livelli,
  piante, parametri, passate, passata_parametri, misure
  from authenticated;
-- I membri si aggiungono solo dal trigger (in futuro da una RPC di condivisione).
revoke insert, update, delete on table membri_esperimento from authenticated;
