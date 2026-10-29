import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EMAIL_GIA_INVITATA, ELEMENTO_NON_TROVATO, eEsperimentoNonTrovato, eMisuraNonTrovata, ESPERIMENTO_NON_TROVATO,
  INVITO_GIA_USATO, MISURA_NON_TROVATA, messaggioErrore,
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

  it('invito già usato o revocato, email già invitata, esperimento non trovato: i messaggi passano come sono', () => {
    expect(messaggioErrore(new Error(INVITO_GIA_USATO))).toBe('Questo invito è già stato usato o non c\'è più: ricarica la pagina.')
    expect(messaggioErrore(new Error(EMAIL_GIA_INVITATA))).toBe('Questa email è già stata invitata: trovi l\'invito nell\'elenco.')
    expect(messaggioErrore(new Error(ESPERIMENTO_NON_TROVATO)))
      .toBe('Esperimento non trovato: forse è stato eliminato, o il link non è giusto.')
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

  it('nome doppio nel catalogo (indice catalogo_strumenti_nome_unico)', () => {
    expect(messaggioErrore({
      code: '23505', message: 'duplicate key value violates unique constraint "catalogo_strumenti_nome_unico"',
    })).toBe('Nel catalogo c\'è già uno strumento con questo nome.')
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

describe('eMisuraNonTrovata', () => {
  it('riconosce l\'errore di caricaMisura e nessun altro', () => {
    expect(eMisuraNonTrovata(new Error(MISURA_NON_TROVATA))).toBe(true)
    expect(eMisuraNonTrovata(new Error('Failed to fetch'))).toBe(false)
    expect(eMisuraNonTrovata({ message: MISURA_NON_TROVATA })).toBe(false)
    expect(eMisuraNonTrovata(undefined)).toBe(false)
  })
})
