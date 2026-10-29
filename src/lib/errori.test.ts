import { afterEach, describe, expect, it, vi } from 'vitest'
import { eMisuraNonTrovata, MISURA_NON_TROVATA, messaggioErrore } from './errori'

afterEach(() => { vi.restoreAllMocks() })

const MSG_OFFLINE = 'Nessuna connessione: i dati non sono stati salvati. Riprova quando torna la rete.'
const MSG_SERVER = 'Il server non risponde. Se l\'app non è stata usata per più di una settimana il database potrebbe essere in pausa: riattivalo dal pannello Supabase (vedi README).'
const MSG_SESSIONE = 'Sessione scaduta: accedi di nuovo. I dati inseriti sono ancora nel modulo.'
const MSG_INVITO = 'Email o codice invito non validi. Controlla il messaggio di invito o chiedi all\'amministratore.'

describe('messaggioErrore', () => {
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
