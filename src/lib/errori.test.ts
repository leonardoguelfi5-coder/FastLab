import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EMAIL_GIA_INVITATA, ELEMENTO_NON_TROVATO, ErroreApp, eEsperimentoNonTrovato, eMisuraNonTrovata, ESPERIMENTO_NON_TROVATO,
  FOTO_ESPERIMENTO_NON_RIMOSSE, FOTO_NON_LEGGIBILE, FOTO_TROPPO_GRANDE, eNomeExportGiaUsato, INVITO_GIA_USATO, MISURA_NON_TROVATA, messaggioErrore, SENZA_SESSIONE, STRUMENTO_CON_MISURE_ARRIVATE,
} from './errori'

afterEach(() => { vi.restoreAllMocks() })

const MSG_OFFLINE = 'Nessuna connessione. Riprova quando torna la rete.'
const MSG_SERVER = 'Il server non risponde. Se l\'app non è stata usata per più di una settimana il database potrebbe essere in pausa: riattivalo dal pannello Supabase (vedi README).'
const MSG_SESSIONE = 'Sessione scaduta: accedi di nuovo. I dati inseriti sono ancora nel modulo.'
const MSG_INVITO = 'Email o codice invito non validi. Controlla il messaggio di invito o chiedi all\'amministratore.'

describe('messaggioErrore', () => {
  it('pianta con dati che cambia trattamento (guardia del database)', () => {
    expect(messaggioErrore({ code: 'P0001', message: 'PIANTA_CON_DATI' }))
      .toBe('Questa pianta ha già delle misure: il trattamento non si può cambiare. Etichetta e blocco sì.')
  })

  it('riga spostata in un altro esperimento (guardia del database)', () => {
    expect(messaggioErrore({ code: 'P0001', message: 'ESPERIMENTO_NON_MODIFICABILE' }))
      .toBe('Questo elemento appartiene a un altro esperimento e non si può spostare. Ricarica la pagina.')
  })

  it('elemento non trovato (nessuna riga aggiornata o eliminata): il messaggio è già per l\'utente', () => {
    expect(messaggioErrore(new Error(ELEMENTO_NON_TROVATO))).toBe(ELEMENTO_NON_TROVATO)
    expect(ELEMENTO_NON_TROVATO).toBe('Elemento non trovato: forse è stato rimosso. Ricarica la pagina.')
  })

  it('foto non leggibile e foto dell\'esperimento non rimosse: i messaggi passano come sono', () => {
    expect(messaggioErrore(new Error(FOTO_NON_LEGGIBILE))).toBe(FOTO_NON_LEGGIBILE)
    expect(messaggioErrore(new Error(FOTO_TROPPO_GRANDE))).toBe(FOTO_TROPPO_GRANDE)
    expect(messaggioErrore(new Error(FOTO_ESPERIMENTO_NON_RIMOSSE))).toBe(FOTO_ESPERIMENTO_NON_RIMOSSE)
    expect(FOTO_ESPERIMENTO_NON_RIMOSSE).toContain('non è stato eliminato')
  })

  it('invito già usato o revocato, email già invitata, esperimento non trovato: i messaggi passano come sono', () => {
    expect(messaggioErrore(new Error(INVITO_GIA_USATO))).toBe('Questo invito è già stato usato o non c\'è più: ricarica la pagina.')
    expect(messaggioErrore(new Error(EMAIL_GIA_INVITATA))).toBe('Questa email è già stata invitata: trovi l\'invito nell\'elenco.')
    expect(messaggioErrore(new Error(ESPERIMENTO_NON_TROVATO)))
      .toBe('Esperimento non trovato: forse è stato eliminato, o il link non è giusto.')
  })

  it('senza sessione: il messaggio dell\'app passa com\'è', () => {
    expect(messaggioErrore(new Error(SENZA_SESSIONE))).toBe('Sessione scaduta: accedi di nuovo.')
  })

  it('eEsperimentoNonTrovato riconosce solo l\'errore di caricaConfig', () => {
    expect(eEsperimentoNonTrovato(new Error(ESPERIMENTO_NON_TROVATO))).toBe(true)
    expect(eEsperimentoNonTrovato(new Error(ELEMENTO_NON_TROVATO))).toBe(false)
    expect(eEsperimentoNonTrovato(ESPERIMENTO_NON_TROVATO)).toBe(false)
  })

  it('senza rete (navigator.onLine === false)', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(messaggioErrore(new Error('qualunque cosa'))).toBe(MSG_OFFLINE)
  })

  it('senza rete ha la precedenza su ogni altro errore', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(messaggioErrore(new TypeError('Failed to fetch'))).toBe(MSG_OFFLINE)
    expect(messaggioErrore({ code: '23505', message: 'duplicate key' })).toBe(MSG_OFFLINE)
  })

  it.each(['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed'])(
    'server irraggiungibile: "%s"',
    (messaggio) => {
      expect(messaggioErrore(new TypeError(messaggio))).toBe(MSG_SERVER)
    },
  )

  it('sessione scaduta: code PGRST301', () => {
    expect(messaggioErrore({ code: 'PGRST301', message: 'qualcosa' })).toBe(MSG_SESSIONE)
  })

  it('sessione scaduta: status 401', () => {
    expect(messaggioErrore({ status: 401, message: 'Unauthorized' })).toBe(MSG_SESSIONE)
  })

  it('sessione scaduta: messaggio con JWT expired', () => {
    expect(messaggioErrore({ message: 'JWT expired' })).toBe(MSG_SESSIONE)
  })

  it('credenziali errate', () => {
    expect(messaggioErrore({ message: 'Invalid login credentials', status: 400 })).toBe('Email o password errate.')
  })

  it('registrazione senza invito: messaggio storico di GoTrue', () => {
    expect(messaggioErrore({ message: 'Database error saving new user' })).toBe(MSG_INVITO)
  })

  it('registrazione senza invito: INVITO_MANCANTE (GoTrue recente, HTTP 500)', () => {
    expect(messaggioErrore({ code: 'P0001', message: 'INVITO_MANCANTE' })).toBe(MSG_INVITO)
    expect(messaggioErrore(new Error('Errore: INVITO_MANCANTE (trigger)'))).toBe(MSG_INVITO)
  })

  it('email già registrata', () => {
    expect(messaggioErrore({ message: 'User already registered' })).toBe('Esiste già un account con questa email: accedi.')
  })

  it('parametro con dati', () => {
    expect(messaggioErrore({ code: 'P0001', message: 'PARAMETRO_CON_DATI' })).toBe(
      'Questo parametro ha già dei dati: non si può eliminare né cambiarne il tipo. Puoi archiviarlo.',
    )
  })

  it('duplicato (23505)', () => {
    expect(messaggioErrore({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(
      'Esiste già un elemento con questo nome o etichetta.',
    )
  })

  it('parametro già in un altro strumento (indice strumento_parametri_un_solo_strumento)', () => {
    expect(messaggioErrore({
      code: '23505', message: 'duplicate key value violates unique constraint "strumento_parametri_un_solo_strumento"',
    })).toBe('Un parametro può stare in un solo strumento.')
  })

  it('seconda tabella fenologica (indice strumenti_un_fenologico)', () => {
    expect(messaggioErrore({
      code: '23505', message: 'duplicate key value violates unique constraint "strumenti_un_fenologico"',
    })).toBe('C\'è già una tabella fenologica in questo esperimento.')
  })

  it('nome doppio nel catalogo (indice catalogo_strumenti_nome_unico)', () => {
    expect(messaggioErrore({
      code: '23505', message: 'duplicate key value violates unique constraint "catalogo_strumenti_nome_unico"',
    })).toBe('Nel catalogo c\'è già uno strumento con questo nome.')
  })

  it('nome doppio tra gli export salvati (indice export_salvati_nome_unico)', () => {
    const e = { code: '23505', message: 'duplicate key value violates unique constraint "export_salvati_nome_unico"' }
    expect(messaggioErrore(e)).toBe('Hai già un export salvato con questo nome: scegline un altro o sostituisci quello.')
    expect(eNomeExportGiaUsato(e)).toBe(true)
  })

  it('eNomeExportGiaUsato riconosce solo quell\'indice, e non dipende dalla rete', () => {
    expect(eNomeExportGiaUsato({ code: '23505', message: 'duplicate key value violates unique constraint "export_salvati_pkey"' })).toBe(false)
    expect(eNomeExportGiaUsato({ code: '23505', message: 'duplicate key value violates unique constraint "catalogo_strumenti_nome_unico"' })).toBe(false)
    expect(eNomeExportGiaUsato(new Error('export_salvati_nome_unico'))).toBe(false)
    expect(eNomeExportGiaUsato(null)).toBe(false)
  })

  it('scelte di un export non valide (check export_salvati_scelte_valide, 23514)', () => {
    expect(messaggioErrore({
      code: '23514', message: 'new row for relation "export_salvati" violates check constraint "export_salvati_scelte_valide"',
    })).toBe('Le scelte di questo export non sono valide: controlla strumenti, piante, periodo e fogli, poi riprova.')
  })

  it('nome di un export vuoto o troppo lungo (check export_salvati_nome_check, 23514)', () => {
    expect(messaggioErrore({
      code: '23514', message: 'new row for relation "export_salvati" violates check constraint "export_salvati_nome_check"',
    })).toBe('Il nome dell\'export deve avere da 1 a 80 caratteri.')
  })

  it('strumento collegato a una voce del catalogo che non c\'è (23503 su strumenti_catalogo_id_fkey)', () => {
    expect(messaggioErrore({
      code: '23503',
      message: 'insert or update on table "strumenti" violates foreign key constraint "strumenti_catalogo_id_fkey"',
    })).toBe('Questo strumento del catalogo non esiste più: ricarica la pagina e riprova.')
  })

  it('id di una voce del catalogo cambiato (guardia del database)', () => {
    expect(messaggioErrore({ code: 'P0001', message: 'ID_NON_MODIFICABILE' }))
      .toBe('L\'identificativo di una voce del catalogo non si può cambiare. Ricarica la pagina.')
  })

  it('il nome dell\'indice del catalogo senza 23505 non basta', () => {
    expect(messaggioErrore({ code: 'P0001', message: 'catalogo_strumenti_nome_unico' }))
      .not.toBe('Nel catalogo c\'è già uno strumento con questo nome.')
  })

  it('strumento eliminato mentre arrivavano le sue misure (23503 su misure_strumento_id_esperimento_id_fkey)', () => {
    expect(messaggioErrore({
      code: '23503',
      message: 'update or delete on table "strumenti" violates foreign key constraint "misure_strumento_id_esperimento_id_fkey" on table "misure"',
    })).toBe(STRUMENTO_CON_MISURE_ARRIVATE)
    expect(STRUMENTO_CON_MISURE_ARRIVATE).toBe('Nel frattempo sono arrivate misure di questo strumento: si può solo archiviare.')
  })

  it('dati collegati (23503)', () => {
    expect(messaggioErrore({ code: '23503', message: 'violates foreign key constraint' })).toBe(
      'Questo elemento ha dati collegati e non può essere eliminato.',
    )
  })

  it('altro: Errore imprevisto con il messaggio originale', () => {
    expect(messaggioErrore(new Error('boom'))).toBe('Errore imprevisto: boom')
    expect(messaggioErrore({ message: 'strano' })).toBe('Errore imprevisto: strano')
    expect(messaggioErrore('testo semplice')).toBe('Errore imprevisto: testo semplice')
  })

  it('altro: nessun messaggio utilizzabile', () => {
    expect(messaggioErrore(null)).toBe('Errore imprevisto.')
    expect(messaggioErrore(undefined)).toBe('Errore imprevisto.')
    expect(messaggioErrore({})).toBe('Errore imprevisto.')
  })
})

describe('ErroreApp', () => {
  it('il suo messaggio, già in italiano, passa così com\'è', () => {
    expect(messaggioErrore(new ErroreApp('Una foto non si è scaricata.'))).toBe('Una foto non si è scaricata.')
  })

  it('un Error qualsiasi con lo stesso testo resta «Errore imprevisto»', () => {
    expect(messaggioErrore(new Error('Una foto non si è scaricata.'))).toBe('Errore imprevisto: Una foto non si è scaricata.')
  })
})

describe('eMisuraNonTrovata', () => {
  it('riconosce l\'errore di caricaMisura e nessun altro', () => {
    expect(eMisuraNonTrovata(new Error(MISURA_NON_TROVATA))).toBe(true)
    expect(eMisuraNonTrovata(new Error('Failed to fetch'))).toBe(false)
    expect(eMisuraNonTrovata({ message: MISURA_NON_TROVATA })).toBe(false)
    expect(eMisuraNonTrovata(undefined)).toBe(false)
  })
})
