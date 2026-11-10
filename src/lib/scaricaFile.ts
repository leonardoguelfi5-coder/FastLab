/** Quanto si aspetta prima di liberare l'indirizzo del Blob: tolto subito, qualche browser (Safari su iPhone) non farebbe in tempo a leggerlo. */
export const ATTESA_REVOCA_MS = 30_000

/**
 * Consegna un file al browser: un link `download` su un Blob, cliccato e tolto, e l'indirizzo del Blob si libera dopo
 * `ATTESA_REVOCA_MS`. Lo usano lo .zip delle foto e l'Excel.
 */
export function consegna(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), ATTESA_REVOCA_MS)
}
