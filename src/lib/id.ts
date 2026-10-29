/**
 * Nuovo identificativo uuid v4 generato dal client.
 * `crypto.randomUUID()` esiste solo nei contesti sicuri (https o localhost): aprendo l'app in http
 * da un altro dispositivo della rete manca e la pagina si romperebbe. In quel caso l'uuid si
 * costruisce da `crypto.getRandomValues()`, disponibile ovunque.
 */
export function nuovoId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
