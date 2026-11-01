import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } } }))
vi.mock('@/lib/immagini', () => ({ comprimi: vi.fn() }))

import { supabase } from '@/lib/supabase'
import { comprimi } from '@/lib/immagini'
import { simulaSupabase } from '@/test/supabase-mock'
import { ELEMENTO_NON_TROVATO, ESPERIMENTO_NON_TROVATO } from '@/lib/errori'
import type { Foto } from '@/domain/tipi'
import {
  aggiornaFoto, archiviaFileFoto, caricaFoto, eliminaFileEsperimento, eliminaFoto, listaFoto, spazioFoto, urlFoto,
} from './foto'

const E = 'e0000000-0000-4000-8000-000000000001'
const ID = 'f0000000-0000-4000-8000-000000000002'
const PERCORSO = `${E}/${ID}.jpg`
const errore = { code: '42501', message: 'new row violates row-level security policy', details: '', hint: '' }
const giaEsiste = { name: 'StorageApiError', message: 'The resource already exists', status: 400, statusCode: '409' }

const foto: Foto = {
  id: ID, data: '2026-11-01', percorso: PERCORSO, larghezza: 1600, altezza: 1200, byte: 250000,
  pianta_id: null, nota_id: null, archiviata: false, archiviata_il: null,
}

let mock: ReturnType<typeof simulaSupabase>
beforeEach(() => {
  vi.mocked(supabase.from).mockReset()
  vi.mocked(supabase.rpc).mockReset()
  vi.mocked(supabase.storage.from).mockReset()
  vi.mocked(comprimi).mockReset()
  vi.mocked(comprimi).mockResolvedValue({ blob: new Blob([new Uint8Array(250000)], { type: 'image/jpeg' }), larghezza: 1600, altezza: 1200 })
  mock = simulaSupabase(supabase)
})

/** Le operazioni in ordine, come `sorgente.metodo`, tenendo solo quelle che interessano. */
const ordine = (...metodi: string[]) => mock.chiamate.map(c => `${c.sorgente}.${c.metodo}`).filter(x => metodi.includes(x))

describe('caricaFoto', () => {
  const file = new File(['x'], 'IMG_1.jpg', { type: 'image/jpeg' })

  it('comprime, carica il file (senza sovrascrivere, come image/jpeg) e poi scrive la riga', async () => {
    const f = await caricaFoto(E, { id: ID, file, data: '2026-10-28', piantaId: 'p1', notaId: null })

    expect(ordine('storage:foto.upload', 'foto.upsert')).toEqual(['storage:foto.upload', 'foto.upsert'])
    const [percorso, blob, opzioni] = mock.storage.di('upload')[0].args as [string, Blob, unknown]
    expect(percorso).toBe(PERCORSO)
    expect(blob.size).toBe(250000)
    expect(opzioni).toEqual({ contentType: 'image/jpeg', upsert: false })
    expect(mock.di('foto').map(c => [c.metodo, ...c.args])).toEqual([[
      'upsert',
      { id: ID, esperimento_id: E, data: '2026-10-28', percorso: PERCORSO, larghezza: 1600, altezza: 1200, byte: 250000, pianta_id: 'p1', nota_id: null },
      { onConflict: 'id' },
    ]])
    expect(f).toEqual({
      id: ID, data: '2026-10-28', percorso: PERCORSO, larghezza: 1600, altezza: 1200, byte: 250000,
      pianta_id: 'p1', nota_id: null, archiviata: false, archiviata_il: null,
    })
  })

  it('collega la foto a una nota', async () => {
    const f = await caricaFoto(E, { id: ID, file, data: '2026-10-28', notaId: 'n1' })
    expect(f).toMatchObject({ pianta_id: null, nota_id: 'n1' })
  })

  it('se la riga non si scrive dopo un caricamento nuovo, toglie il file: niente file senza riga', async () => {
    mock.risponde('foto', { error: errore })

    await expect(caricaFoto(E, { id: ID, file, data: '2026-10-28' })).rejects.toBe(errore)

    expect(ordine('storage:foto.upload', 'foto.upsert', 'storage:foto.remove'))
      .toEqual(['storage:foto.upload', 'foto.upsert', 'storage:foto.remove'])
    expect(mock.storage.di('remove')[0].args).toEqual([[PERCORSO]])
  })

  it('se anche togliere il file fallisce l\'errore che si vede è quello della riga', async () => {
    mock.risponde('foto', { error: errore })
    mock.storage.risponde('remove', { error: { message: 'rete' } })

    await expect(caricaFoto(E, { id: ID, file, data: '2026-10-28' })).rejects.toBe(errore)
  })

  it('se anche togliere il file lancia un\'eccezione l\'errore che si vede è sempre quello della riga', async () => {
    mock.risponde('foto', { error: errore })
    mock.storage.risponde('remove', () => { throw new Error('rete') })

    await expect(caricaFoto(E, { id: ID, file, data: '2026-10-28' })).rejects.toBe(errore)
  })

  it('un errore di rete sulla riga lascia il file: l\'esito è incerto e una riga senza file è peggio di un file senza riga', async () => {
    const rete = new TypeError('Failed to fetch')
    mock.risponde('foto', { error: rete })

    await expect(caricaFoto(E, { id: ID, file, data: '2026-10-28' })).rejects.toBe(rete)

    expect(mock.storage.di('remove')).toEqual([])
  })

  it('un errore senza code né stato (sconosciuto) lascia il file; con uno stato HTTP lo toglie', async () => {
    mock.risponde('foto', { error: { message: 'boh' } })
    await expect(caricaFoto(E, { id: ID, file, data: '2026-10-28' })).rejects.toBeDefined()
    expect(mock.storage.di('remove')).toEqual([])

    mock.risponde('foto', { error: { message: 'Bad Gateway', status: 502 } })
    await expect(caricaFoto(E, { id: ID, file, data: '2026-10-28' })).rejects.toBeDefined()
    expect(mock.storage.di('remove')).toHaveLength(1)
  })

  it('un id che non è un uuid (esperimento o foto) si rifiuta prima di comprimere', async () => {
    await expect(caricaFoto('..', { id: ID, file, data: '2026-10-28' })).rejects.toThrow(ESPERIMENTO_NON_TROVATO)
    await expect(caricaFoto(E, { id: 'f1', file, data: '2026-10-28' })).rejects.toThrow('Identificativo della foto non valido.')
    expect(comprimi).not.toHaveBeenCalled()
    expect(mock.storage.di('upload')).toEqual([])
  })

  it('un caricamento che fallisce non scrive nessuna riga e non toglie nulla', async () => {
    const e = { message: 'Payload too large', statusCode: '413' }
    mock.storage.risponde('upload', { error: e })

    await expect(caricaFoto(E, { id: ID, file, data: '2026-10-28' })).rejects.toBe(e)

    expect(mock.di('foto')).toEqual([])
    expect(mock.storage.di('remove')).toEqual([])
  })

  it('"esiste già" vale come riuscito: il file di un tentativo precedente resta e si scrive la riga', async () => {
    mock.storage.risponde('upload', { error: giaEsiste })

    const f = await caricaFoto(E, { id: ID, file, data: '2026-10-28' })

    expect(f.id).toBe(ID)
    expect(mock.di('foto').map(c => c.metodo)).toEqual(['upsert'])
  })

  it('"esiste già" riconosciuto anche dal solo stato 409', async () => {
    mock.storage.risponde('upload', { error: { message: 'Duplicate', status: 409 } })
    await expect(caricaFoto(E, { id: ID, file, data: '2026-10-28' })).resolves.toMatchObject({ id: ID })
  })

  it('se il file esisteva già e la riga non si scrive, il file non si tocca: non è stato questo tentativo a metterlo', async () => {
    mock.storage.risponde('upload', { error: giaEsiste })
    mock.risponde('foto', { error: errore })

    await expect(caricaFoto(E, { id: ID, file, data: '2026-10-28' })).rejects.toBe(errore)

    expect(mock.storage.di('remove')).toEqual([])
  })

  it('un nuovo tentativo con lo stesso id usa lo stesso percorso e non crea un doppione', async () => {
    mock.risponde('foto', () => (mock.di('foto').filter(c => c.metodo === 'upsert').length <= 1 ? { error: errore } : {}))
    // Primo tentativo: la riga fallisce e il file viene tolto. Secondo: file di nuovo nuovo, riga scritta.
    await expect(caricaFoto(E, { id: ID, file, data: '2026-10-28' })).rejects.toBe(errore)
    await caricaFoto(E, { id: ID, file, data: '2026-10-28' })

    const percorsi = mock.storage.di('upload').map(c => c.args[0])
    expect(percorsi).toEqual([PERCORSO, PERCORSO])
    expect(mock.di('foto').filter(c => c.metodo === 'upsert').map(c => (c.args[0] as { id: string }).id)).toEqual([ID, ID])
  })

  it('un nuovo tentativo dopo una riga scritta ma risposta persa (file già lì) non duplica nulla', async () => {
    // Il primo tentativo ha scritto file e riga ma la risposta non è arrivata: il secondo trova il file e riscrive la riga per id.
    mock.storage.risponde('upload', { error: giaEsiste })
    await caricaFoto(E, { id: ID, file, data: '2026-10-28' })
    expect(mock.di('foto')[0].args[1]).toEqual({ onConflict: 'id' })
  })

  it('se la foto non si apre non carica niente', async () => {
    const e = new Error('Non riesco ad aprire questa foto')
    vi.mocked(comprimi).mockRejectedValue(e)

    await expect(caricaFoto(E, { id: ID, file, data: '2026-10-28' })).rejects.toBe(e)

    expect(mock.storage.di('upload')).toEqual([])
    expect(mock.di('foto')).toEqual([])
  })

  it('porta in minuscolo il percorso (il database confronta con gli uuid in minuscolo)', async () => {
    const f = await caricaFoto(E.toUpperCase(), { id: ID.toUpperCase(), file, data: '2026-10-28' })
    expect(f.percorso).toBe(PERCORSO)
  })
})

describe('listaFoto', () => {
  function pagineDa(pagine: unknown[][]) {
    const chiamate: unknown[][] = []
    vi.mocked(supabase.from).mockImplementation((() => {
      const pagina = pagine.shift() ?? []
      const q: unknown = new Proxy({}, {
        get: (_t, prop) => prop === 'then'
          ? (ok: (v: unknown) => unknown) => Promise.resolve({ data: pagina, error: null }).then(ok)
          : (...args: unknown[]) => { chiamate.push([prop, ...args]); return q },
      })
      return q
    }) as never)
    return chiamate
  }
  const riga = (i: number) => ({
    id: `f${i}`, esperimento_id: E, data: '2026-11-01', percorso: `${E}/f${i}.jpg`, larghezza: 1600, altezza: 1200, byte: 1000,
    pianta_id: null, nota_id: null, archiviata: false, archiviata_il: null, creato_da: 'u1', creato_il: '2026-11-01T08:00:00Z',
  })

  it('legge le foto dell\'esperimento, dalla data più recente, fino a una pagina vuota', async () => {
    const chiamate = pagineDa([[riga(1), riga(2)], [riga(3)], []])

    const lista = await listaFoto(E)

    expect(lista.map(f => f.id)).toEqual(['f1', 'f2', 'f3'])
    expect(lista[0]).not.toHaveProperty('esperimento_id')
    expect(chiamate.slice(0, 5)).toEqual([
      ['select', '*'],
      ['eq', 'esperimento_id', E],
      ['order', 'data', { ascending: false }],
      ['order', 'creato_il', { ascending: false }],
      ['order', 'id', { ascending: false }],
    ])
    expect(chiamate.filter(c => c[0] === 'range').map(c => c.slice(1))).toEqual([[0, 999], [2, 1001], [3, 1002]])
  })

  it('una riga che passa da una pagina all\'altra compare una volta sola', async () => {
    pagineDa([[riga(1), riga(2)], [riga(2), riga(3)], []])
    expect((await listaFoto(E)).map(f => f.id)).toEqual(['f1', 'f2', 'f3'])
  })

  it('un errore di lettura non si nasconde', async () => {
    mock.risponde('foto', { error: errore })
    await expect(listaFoto(E)).rejects.toBe(errore)
  })
})

describe('urlFoto', () => {
  it('chiede gli URL firmati con validità di un\'ora e li dà per percorso', async () => {
    mock.storage.risponde('createSignedUrls', {
      data: [{ path: 'a', signedUrl: 'https://s/a?t=1', error: null }, { path: 'b', signedUrl: 'https://s/b?t=1', error: null }],
    })

    const urls = await urlFoto(['a', 'b'])

    expect(mock.storage.di('createSignedUrls')[0].args).toEqual([['a', 'b'], 3600])
    expect(urls.get('a')).toBe('https://s/a?t=1')
    expect(urls.get('b')).toBe('https://s/b?t=1')
  })

  it('senza percorsi non chiama niente', async () => {
    expect((await urlFoto([])).size).toBe(0)
    expect(mock.storage.di('createSignedUrls')).toEqual([])
  })

  it('un percorso senza URL (file tolto, accesso negato) manca dalla mappa, gli altri restano', async () => {
    mock.storage.risponde('createSignedUrls', {
      data: [{ path: 'a', signedUrl: null, error: 'Object not found' }, { path: 'b', signedUrl: 'https://s/b', error: null }],
    })
    const urls = await urlFoto(['a', 'b'])
    expect(urls.has('a')).toBe(false)
    expect(urls.get('b')).toBe('https://s/b')
  })

  it('un errore dello Storage si propaga', async () => {
    const e = { message: 'rete' }
    mock.storage.risponde('createSignedUrls', { error: e })
    await expect(urlFoto(['a'])).rejects.toBe(e)
  })

  it('divide in gruppi da 100 percorsi', async () => {
    mock.storage.risponde('createSignedUrls', args => ({
      data: (args[0] as string[]).map(p => ({ path: p, signedUrl: `https://s/${p}`, error: null })),
    }))
    const percorsi = Array.from({ length: 250 }, (_, i) => `p${i}`)

    const urls = await urlFoto(percorsi)

    expect(mock.storage.di('createSignedUrls').map(c => (c.args[0] as string[]).length)).toEqual([100, 100, 50])
    expect(urls.size).toBe(250)
  })
})

describe('eliminaFoto', () => {
  it('prima elimina la riga, poi il file', async () => {
    mock.risponde('foto', { data: [{ id: ID }] })

    const r = await eliminaFoto(E, foto)

    expect(ordine('foto.delete', 'storage:foto.remove')).toEqual(['foto.delete', 'storage:foto.remove'])
    expect(mock.di('foto').map(c => [c.metodo, ...c.args])).toEqual([
      ['delete'], ['eq', 'id', ID], ['eq', 'esperimento_id', E], ['select', 'id'],
    ])
    expect(mock.storage.di('remove')[0].args).toEqual([[PERCORSO]])
    expect(r).toEqual({ fileRimosso: true })
  })

  it('se la riga non si elimina il file resta dov\'è', async () => {
    mock.risponde('foto', { error: errore })
    await expect(eliminaFoto(E, foto)).rejects.toBe(errore)
    expect(mock.storage.di('remove')).toEqual([])
  })

  it('una riga che non c\'è più (nessuna riga toccata) è un errore, il file non si tocca', async () => {
    mock.risponde('foto', { data: [] })
    await expect(eliminaFoto(E, foto)).rejects.toThrow(ELEMENTO_NON_TROVATO)
    expect(mock.storage.di('remove')).toEqual([])
  })

  it('se il file non si elimina la riga è già andata: non è un errore, lo si segnala', async () => {
    mock.risponde('foto', { data: [{ id: ID }] })
    mock.storage.risponde('remove', { error: { message: 'rete' } })
    expect(await eliminaFoto(E, foto)).toEqual({ fileRimosso: false })
  })

  it('se togliere il file lancia un\'eccezione la riga è già andata: lo stesso segnale', async () => {
    mock.risponde('foto', { data: [{ id: ID }] })
    mock.storage.risponde('remove', () => { throw new TypeError('Failed to fetch') })
    expect(await eliminaFoto(E, foto)).toEqual({ fileRimosso: false })
  })

  it('una foto archiviata non ha più il file: si elimina solo la riga', async () => {
    mock.risponde('foto', { data: [{ id: ID }] })
    expect(await eliminaFoto(E, { ...foto, archiviata: true })).toEqual({ fileRimosso: true })
    expect(mock.storage.di('remove')).toEqual([])
  })
})

describe('aggiornaFoto', () => {
  it('cambia solo data e collegamenti, per id e esperimento', async () => {
    mock.risponde('foto', { data: [{ id: ID }] })

    await aggiornaFoto(E, ID, { data: '2026-10-30', pianta_id: 'p1', nota_id: null })

    expect(mock.di('foto').map(c => [c.metodo, ...c.args])).toEqual([
      ['update', { data: '2026-10-30', pianta_id: 'p1', nota_id: null }], ['eq', 'id', ID], ['eq', 'esperimento_id', E], ['select', 'id'],
    ])
  })

  it('ignora i campi che non sono suoi (percorso, byte, archiviata, creato_da)', async () => {
    mock.risponde('foto', { data: [{ id: ID }] })
    await aggiornaFoto(E, ID, { data: '2026-10-30', percorso: 'altro', archiviata: true, byte: 1 } as never)
    expect(mock.di('foto')[0].args).toEqual([{ data: '2026-10-30' }])
  })

  it('senza campi non scrive nulla', async () => {
    await aggiornaFoto(E, ID, {})
    expect(mock.chiamate).toEqual([])
  })

  it('una foto eliminata nel frattempo fa fallire l\'aggiornamento', async () => {
    mock.risponde('foto', { data: [] })
    await expect(aggiornaFoto(E, ID, { data: '2026-10-30' })).rejects.toThrow(ELEMENTO_NON_TROVATO)
  })
})

describe('spazioFoto', () => {
  let n = 0
  const riga = (esp: string, byte: number | null) => ({ id: `r${n++}`, esperimento_id: esp, byte })

  it('somma i byte delle foto dell\'esperimento e di tutto il progetto, a pagine', async () => {
    const chiamate: unknown[][] = []
    const pagine: unknown[][] = [[riga(E, 1000), riga('altro', 500)], [riga(E, null), riga('altro', 250)], []]
    vi.mocked(supabase.from).mockImplementation((() => {
      const pagina = pagine.shift() ?? []
      const q: unknown = new Proxy({}, {
        get: (_t, prop) => prop === 'then'
          ? (ok: (v: unknown) => unknown) => Promise.resolve({ data: pagina, error: null }).then(ok)
          : (...args: unknown[]) => { chiamate.push([prop, ...args]); return q },
      })
      return q
    }) as never)

    expect(await spazioFoto(E)).toEqual({ esperimento: 1000, progetto: 1750 })
    // Le foto archiviate non occupano più spazio: non si contano.
    expect(chiamate.slice(0, 4)).toEqual([
      ['select', 'id, esperimento_id, byte'], ['eq', 'archiviata', false], ['order', 'id'], ['range', 0, 999],
    ])
  })

  it('senza foto è zero', async () => {
    mock.risponde('foto', { data: [] })
    expect(await spazioFoto(E)).toEqual({ esperimento: 0, progetto: 0 })
  })

  it('un errore di lettura non si nasconde', async () => {
    mock.risponde('foto', { error: errore })
    await expect(spazioFoto(E)).rejects.toBe(errore)
  })
})

describe('eliminaFileEsperimento', () => {
  const nome = (i: number) => `f000000${i}-0000-4000-8000-000000000000.jpg`
  const file = (i: number) => ({ name: nome(i), id: `id-${i}` })

  it('elenca tutta la cartella dell\'esperimento e poi toglie i file', async () => {
    mock.storage.risponde('list', { data: [file(1), file(2), file(3)] })
    mock.storage.risponde('remove', args => ({ data: (args[0] as string[]).map(name => ({ name })) }))

    const n = await eliminaFileEsperimento(E)

    expect(n).toBe(3)
    expect(mock.storage.di('list').map(c => c.args[0])).toEqual([E])
    expect(mock.storage.di('remove').map(c => c.args[0])).toEqual([[`${E}/${nome(1)}`, `${E}/${nome(2)}`, `${E}/${nome(3)}`]])
    expect(ordine('storage:foto.list', 'storage:foto.remove')).toEqual(['storage:foto.list', 'storage:foto.remove'])
  })

  it('con più di 100 file elenca e toglie a pagine da 100', async () => {
    const tutti = Array.from({ length: 250 }, (_, i) => ({ name: `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000.jpg`, id: `i${i}` }))
    mock.storage.risponde('list', args => ({ data: tutti.slice((args[1] as { offset: number }).offset, (args[1] as { offset: number }).offset + 100) }))
    mock.storage.risponde('remove', args => ({ data: (args[0] as string[]).map(name => ({ name })) }))

    expect(await eliminaFileEsperimento(E)).toBe(250)

    expect(mock.storage.di('list').map(c => (c.args[1] as { offset: number }).offset)).toEqual([0, 100, 200])
    expect(mock.storage.di('remove').map(c => (c.args[0] as string[]).length)).toEqual([100, 100, 50])
  })

  it('un segnaposto della cartella (.emptyFolderPlaceholder) o altri nomi estranei si ignorano e l\'eliminazione finisce', async () => {
    mock.storage.risponde('list', { data: [{ name: '.emptyFolderPlaceholder', id: 'p' }, file(1), { name: 'nota.txt', id: 'n' }] })
    mock.storage.risponde('remove', args => ({ data: (args[0] as string[]).map(name => ({ name })) }))

    expect(await eliminaFileEsperimento(E)).toBe(1)
    expect(mock.storage.di('remove')[0].args[0]).toEqual([`${E}/${nome(1)}`])
  })

  it('una cartella con solo nomi estranei finisce senza errore e senza rimozioni', async () => {
    mock.storage.risponde('list', { data: [{ name: '.emptyFolderPlaceholder', id: 'p' }] })
    expect(await eliminaFileEsperimento(E)).toBe(0)
    expect(mock.storage.di('remove')).toEqual([])
    expect(mock.storage.di('list')).toHaveLength(1)
  })

  it('un segnaposto in prima pagina non nasconde le foto delle pagine dopo', async () => {
    const pagina1 = [{ name: '.emptyFolderPlaceholder', id: 'p' }, ...Array.from({ length: 99 }, (_, i) => ({ name: `a${String(i).padStart(7, '0')}-0000-4000-8000-000000000000.jpg`, id: `a${i}` }))]
    const pagina2 = [{ name: 'b0000000-0000-4000-8000-000000000000.jpg', id: 'b' }]
    mock.storage.risponde('list', (_a, volta) => ({ data: volta === 0 ? pagina1 : pagina2 }))
    mock.storage.risponde('remove', args => ({ data: (args[0] as string[]).map(name => ({ name })) }))

    expect(await eliminaFileEsperimento(E)).toBe(100)
  })

  it('senza file non toglie niente', async () => {
    mock.storage.risponde('list', { data: [] })
    expect(await eliminaFileEsperimento(E)).toBe(0)
    expect(mock.storage.di('remove')).toEqual([])
  })

  it('un errore nell\'elenco si propaga', async () => {
    const e = { message: 'rete' }
    mock.storage.risponde('list', { error: e })
    await expect(eliminaFileEsperimento(E)).rejects.toBe(e)
  })

  it('un errore nella rimozione si propaga e non si va avanti', async () => {
    const e = { message: 'rete' }
    mock.storage.risponde('list', { data: [file(1)] })
    mock.storage.risponde('remove', { error: e })
    await expect(eliminaFileEsperimento(E)).rejects.toBe(e)
  })

  it('una rimozione che non toglie nulla (accesso negato in silenzio) è un errore', async () => {
    mock.storage.risponde('list', { data: [file(1)] })
    mock.storage.risponde('remove', { data: [] })
    await expect(eliminaFileEsperimento(E)).rejects.toThrow()
  })

  it('le sottocartelle (voci senza id) non si toccano', async () => {
    mock.storage.risponde('list', { data: [{ name: nome(1), id: null }] })
    expect(await eliminaFileEsperimento(E)).toBe(0)
    expect(mock.storage.di('remove')).toEqual([])
  })

  it('un id che non è un uuid non elenca niente (una stringa vuota elencherebbe tutto il bucket)', async () => {
    await expect(eliminaFileEsperimento('')).rejects.toThrow(ESPERIMENTO_NON_TROVATO)
    await expect(eliminaFileEsperimento('../altro')).rejects.toThrow(ESPERIMENTO_NON_TROVATO)
    expect(mock.storage.di('list')).toEqual([])
  })
})

describe('archiviaFileFoto', () => {
  const idDi = (i: number) => `f${String(i).padStart(7, '0')}-0000-4000-8000-000000000000`
  const fotoN = (i: number): Foto => ({ ...foto, id: idDi(i), percorso: `${E}/${idDi(i)}.jpg` })
  const elenco = (n: number) => Array.from({ length: n }, (_, i) => fotoN(i + 1))
  /** Il file `i` nello Storage, come lo elenca `list`. */
  const file = (i: number) => ({ name: `${idDi(i)}.jpg`, id: `o${i}` })
  const rimuovi = (args: unknown[]) => ({ data: (args[0] as string[]).map(name => ({ name })) })
  /** Gli update sulle righe: i valori scritti e gli id colpiti. */
  const aggiornamenti = () => {
    const out: { valori: unknown; ids: unknown }[] = []
    let corrente: { valori?: unknown; ids?: unknown } = {}
    for (const c of mock.di('foto')) {
      if (c.metodo === 'update') corrente = { valori: c.args[0] }
      if (c.metodo === 'in') { corrente.ids = c.args[1]; out.push(corrente as { valori: unknown; ids: unknown }) }
    }
    return out
  }
  /** Gli update riescono e rispondono con una riga per id colpito. */
  const aggiornaRiuscito = () => mock.risponde('foto', () => ({ data: mock.di('foto').filter(c => c.metodo === 'in').slice(-1).flatMap(c => (c.args[1] as string[]).map(id => ({ id }))) }))

  it('toglie i file a gruppi da 100 e segna archiviate, con la data, le foto il cui file è stato tolto', async () => {
    mock.storage.risponde('list', { data: [file(1), file(2), file(3)] })
    mock.storage.risponde('remove', rimuovi)
    aggiornaRiuscito()

    const n = await archiviaFileFoto(E, elenco(3))

    expect(n).toBe(3)
    expect(mock.storage.di('remove').map(c => c.args[0])).toEqual([[1, 2, 3].map(i => `${E}/${idDi(i)}.jpg`)])
    const [u] = aggiornamenti()
    expect(u.ids).toEqual([1, 2, 3].map(idDi))
    expect(u.valori).toEqual({ archiviata: true, archiviata_il: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) })
    expect(mock.di('foto').some(c => c.metodo === 'eq' && c.args[0] === 'esperimento_id' && c.args[1] === E)).toBe(true)
    // Prima si guarda cosa c'è, poi si toglie, poi si scrive.
    expect(ordine('storage:foto.list', 'storage:foto.remove', 'foto.update')).toEqual(['storage:foto.list', 'storage:foto.remove', 'foto.update'])
  })

  it('con più di 100 foto toglie e segna a gruppi da 100: le righe seguono i file, gruppo per gruppo', async () => {
    const tutte = elenco(250)
    mock.storage.risponde('list', args => ({ data: tutte.slice((args[1] as { offset: number }).offset, (args[1] as { offset: number }).offset + 100).map((_, i) => file((args[1] as { offset: number }).offset + i + 1)) }))
    mock.storage.risponde('remove', rimuovi)
    aggiornaRiuscito()

    expect(await archiviaFileFoto(E, tutte)).toBe(250)

    expect(mock.storage.di('remove').map(c => (c.args[0] as string[]).length)).toEqual([100, 100, 50])
    expect(aggiornamenti().map(u => (u.ids as string[]).length)).toEqual([100, 100, 50])
    expect(ordine('storage:foto.remove', 'foto.update')).toEqual([
      'storage:foto.remove', 'foto.update', 'storage:foto.remove', 'foto.update', 'storage:foto.remove', 'foto.update',
    ])
  })

  it('segna archiviata solo la foto il cui file è stato davvero tolto: una voce non restituita da remove resta com\'è, e si dice', async () => {
    mock.storage.risponde('list', { data: [file(1), file(2)] })
    mock.storage.risponde('remove', args => ({ data: (args[0] as string[]).filter(p => p.includes(idDi(1))).map(name => ({ name })) }))
    aggiornaRiuscito()

    await expect(archiviaFileFoto(E, elenco(2))).rejects.toThrow(/1 file/)

    expect(aggiornamenti().map(u => u.ids)).toEqual([[idDi(1)]])
  })

  it('se la rimozione dà errore non segna niente', async () => {
    const e = { message: 'rete' }
    mock.storage.risponde('list', { data: [file(1)] })
    mock.storage.risponde('remove', { error: e })

    await expect(archiviaFileFoto(E, elenco(1))).rejects.toBe(e)
    expect(aggiornamenti()).toEqual([])
  })

  it('se l\'update fallisce dopo la rimozione l\'errore arriva a chi chiama; il nuovo giro segna le foto il cui file non c\'è più, senza togliere altro', async () => {
    const e = { code: '57014', message: 'timeout', details: '', hint: '' }
    mock.storage.risponde('list', { data: [file(1), file(2)] })
    mock.storage.risponde('remove', rimuovi)
    mock.risponde('foto', { error: e })
    await expect(archiviaFileFoto(E, elenco(2))).rejects.toBe(e)
    expect(mock.storage.di('remove')).toHaveLength(1)

    // Secondo giro: i file ora non ci sono più, le righe risultano ancora non archiviate.
    mock.storage.risponde('list', { data: [] })
    aggiornaRiuscito()
    expect(await archiviaFileFoto(E, elenco(2))).toBe(2)

    expect(mock.storage.di('remove')).toHaveLength(1)
    expect(aggiornamenti().slice(-1).map(u => u.ids)).toEqual([[idDi(1), idDi(2)]])
  })

  it('un giro misto: segna quelle già senza file e toglie le altre', async () => {
    mock.storage.risponde('list', { data: [file(2)] })
    mock.storage.risponde('remove', rimuovi)
    aggiornaRiuscito()

    expect(await archiviaFileFoto(E, elenco(2))).toBe(2)

    expect(mock.storage.di('remove').map(c => c.args[0])).toEqual([[`${E}/${idDi(2)}.jpg`]])
    expect(aggiornamenti().map(u => u.ids)).toEqual([[idDi(1)], [idDi(2)]])
  })

  it('tocca solo le foto date: un file di una foto non in elenco non si rimuove né si segna', async () => {
    mock.storage.risponde('list', { data: [file(1), file(2), file(9)] })
    mock.storage.risponde('remove', rimuovi)
    aggiornaRiuscito()

    await archiviaFileFoto(E, elenco(2))

    expect(mock.storage.di('remove').flatMap(c => c.args[0] as string[])).not.toContain(`${E}/${idDi(9)}.jpg`)
    expect(aggiornamenti().flatMap(u => u.ids as string[])).not.toContain(idDi(9))
  })

  it('senza foto non fa niente', async () => {
    expect(await archiviaFileFoto(E, [])).toBe(0)
    expect(mock.chiamate).toEqual([])
  })

  it('un errore nell\'elenco dello Storage si propaga e non si toglie né si segna niente', async () => {
    const e = { message: 'rete' }
    mock.storage.risponde('list', { error: e })
    await expect(archiviaFileFoto(E, elenco(1))).rejects.toBe(e)
    expect(mock.storage.di('remove')).toEqual([])
    expect(aggiornamenti()).toEqual([])
  })

  it('una foto il cui percorso non è quello dell\'esperimento si rifiuta prima di toccare qualcosa', async () => {
    await expect(archiviaFileFoto(E, [{ ...fotoN(1), percorso: 'altro/x.jpg' }])).rejects.toThrow()
    expect(mock.chiamate).toEqual([])
    await expect(archiviaFileFoto('../altro', elenco(1))).rejects.toThrow(ESPERIMENTO_NON_TROVATO)
  })
})
