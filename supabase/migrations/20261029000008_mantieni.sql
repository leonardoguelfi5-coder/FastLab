-- Via "ricorda tra piante": il valore uguale tra una pianta e l'altra non e' piu' una proprieta' del parametro
-- ma una scelta di chi rileva, "Mantieni questo parametro uguale anche nelle prossime misure", che vive nel
-- dispositivo (store di campo) e non nel database. La colonna non serve piu'. Una bozza che la porta ancora
-- (un client vecchio) funziona lo stesso: jsonb_to_recordset ignora le chiavi che non elenca.
alter table parametri drop column ricorda_tra_piante;

-- crea_esperimento come nella migration 0007, senza il campo dei parametri.
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
                                n_letture, valore_min, valore_max, sotto_campi)
  select p.id, v_id, p.nome, p.unita, p.tipo, p.ordine,
         coalesce(p.archiviato, false), coalesce(p.progressivo, false),
         coalesce(p.n_letture, 1), p.valore_min, p.valore_max, coalesce(p.sotto_campi, '[]')
    from jsonb_to_recordset(coalesce(bozza -> 'parametri', '[]'))
         as p (id uuid, nome text, unita text, tipo text, ordine int, archiviato boolean, progressivo boolean,
               n_letture int, valore_min numeric, valore_max numeric,
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
