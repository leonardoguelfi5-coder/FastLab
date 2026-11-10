import type { LucideIcon } from 'lucide-react'
import {
  Droplets, FlaskConical, Flame, Gauge, HeartPulse, Leaf, Ruler, Scale, Sprout, Sun, Thermometer, TriangleRight, Wind,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * L'icona Lucide al posto dell'emoji di uno strumento. L'emoji resta il dato scelto da chi configura lo strumento
 * (nel catalogo e nelle impostazioni): qui si sceglie solo come mostrarla. Un'emoji che non conosciamo diventa la
 * fiaschetta generica.
 */
const PER_EMOJI: Record<string, LucideIcon> = {
  '🌡': Thermometer, '🌡️': Thermometer,
  '💚': HeartPulse, '🍀': Leaf, '🌿': Leaf,
  '📏': Ruler,
  '📐': TriangleRight,
  '🌱': Sprout,
  '🍃': Wind,
  '🔥': Flame,
  '💧': Droplets,
  '☀️': Sun, '☀': Sun,
  '⚖️': Scale, '⚖': Scale,
  '⏱️': Gauge, '⏱': Gauge,
}

export function iconaDaEmoji(emoji: string | null | undefined): LucideIcon {
  return (emoji && PER_EMOJI[emoji.trim()]) || FlaskConical
}

/**
 * Un'icona in un cerchio: 40px, fondo carta ombra, tratto grafite. È sempre decorativa (il nome accanto la dice già),
 * quindi è nascosta ai lettori di schermo.
 */
export function IconaTonda({ icona: Icona, piccola, className }: { icona: LucideIcon; piccola?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-carta-ombra text-grafite',
        piccola ? 'size-7 [&_svg]:size-3.5' : 'size-10 [&_svg]:size-5',
        className,
      )}
    >
      <Icona strokeWidth={2} />
    </span>
  )
}

/** L'icona di uno strumento nel suo cerchio, dall'emoji salvata. Senza emoji non disegna niente. */
export function IconaStrumento({ emoji, piccola, className }: { emoji: string | null | undefined; piccola?: boolean; className?: string }) {
  if (!emoji) return null
  return <IconaTonda icona={iconaDaEmoji(emoji)} piccola={piccola} className={className} />
}
