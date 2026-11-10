-- FastLab v3: guardie su piante e su esperimento_id.
--
-- 1. Una pianta con misure non cambia trattamento: le sue misure finirebbero sotto un altro
--    trattamento (nei grafici e nell'export). Etichetta, blocco e ordine restano modificabili,
--    e riscrivere lo stesso trattamento (l'app manda sempre tutta la riga) non e' un cambio.
-- 2. Nessuna riga di dominio cambia esperimento: un upsert con l'id di una riga di un altro
--    esperimento, di cui l'utente e' membro, la sposterebbe (le policy guardano solo
--    l'appartenenza, prima e dopo).

-- security definer: la guardia deve vedere tutte le misure della pianta, a prescindere dalle
-- policy RLS di chi esegue (come guardia_parametri).
create function guardia_piante() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.misure
    where esperimento_id = old.esperimento_id and pianta_id = old.id
  ) then
    raise exception 'PIANTA_CON_DATI';
  end if;
  return new;
end
$$;

create trigger guardia_piante
  before update of trattamento_id on piante
  for each row
  when (new.trattamento_id is distinct from old.trattamento_id)
  execute function guardia_piante();

create function guardia_esperimento_id() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'ESPERIMENTO_NON_MODIFICABILE';
end
$$;

-- Tutte le tabelle con esperimento_id (membri_esperimento non ha UPDATE per i client, ma la
-- guardia vale anche li': nessuna riga passa da un esperimento all'altro).
create trigger guardia_esperimento_id before update of esperimento_id on fattori
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();
create trigger guardia_esperimento_id before update of esperimento_id on livelli
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();
create trigger guardia_esperimento_id before update of esperimento_id on trattamenti
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();
create trigger guardia_esperimento_id before update of esperimento_id on trattamento_livelli
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();
create trigger guardia_esperimento_id before update of esperimento_id on piante
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();
create trigger guardia_esperimento_id before update of esperimento_id on parametri
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();
create trigger guardia_esperimento_id before update of esperimento_id on passate
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();
create trigger guardia_esperimento_id before update of esperimento_id on passata_parametri
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();
create trigger guardia_esperimento_id before update of esperimento_id on misure
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();
create trigger guardia_esperimento_id before update of esperimento_id on membri_esperimento
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();

revoke execute on function guardia_piante() from public, anon, authenticated;
revoke execute on function guardia_esperimento_id() from public, anon, authenticated;
