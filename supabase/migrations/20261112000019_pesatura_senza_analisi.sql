-- Pesatura senza analisi salvate (revisione del 2026-11-12, chiesta dall'utente).
--
-- 1. Le analisi salvate (analisi_pesatura) spariscono: ogni pesata nasce con tutte le sue impostazioni scritte da chi
--    la avvia. Le sessioni avevano gia' la loro copia di titolo, tipo, unita' e impostazioni (20261111000017), quindi
--    nessuna pesata perde dati: si toglie solo il collegamento analisi_id, con la tabella e la sua guardia.
--    Le policy di sessioni_pesatura che controllavano l'analisi si riscrivono senza quel controllo.
-- 2. L'unita' di peso e' libera: g, mg, kg o quella che scrive l'utente (non vuota, al massimo 20 caratteri).

-- ===== 1. Niente analisi =====
drop policy sessioni_pesatura_insert on sessioni_pesatura;
drop policy sessioni_pesatura_update on sessioni_pesatura;
-- Questa policy delle analisi legge sessioni_pesatura.analisi_id: va tolta prima della colonna.
drop policy analisi_pesatura_select on analisi_pesatura;

-- La colonna porta via con se' la sua chiave esterna e l'indice sessioni_pesatura_analisi_idx.
alter table sessioni_pesatura drop column analisi_id;

-- La tabella porta via con se' le sue policy e i suoi trigger (guardia_tipo_analisi compresa).
drop table analisi_pesatura;
drop function guardia_tipo_analisi();

create policy sessioni_pesatura_insert on sessioni_pesatura
  for insert to authenticated
  with check (public.puo_scrivere(esperimento_id) and creato_da = (select auth.uid()));
create policy sessioni_pesatura_update on sessioni_pesatura
  for update to authenticated
  using (public.puo_gestire_sessione(id))
  with check (public.puo_gestire_sessione(id));

-- ===== 2. Unita' libera =====
alter table sessioni_pesatura drop constraint sessioni_pesatura_unita_check;
alter table sessioni_pesatura add constraint sessioni_pesatura_unita_check
  check (btrim(unita) <> '' and char_length(unita) <= 20);
