import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Pulsanti di DESIGN.md §5: grandi per il pollice, piatti (nessuna ombra), premuto più scuro,
 * focus con l'anello d'inchiostro globale (index.css). Il disabilitato non usa opacità: carta ombra
 * con testo grafite tenue, che resta sopra 4.5:1.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent whitespace-nowrap select-none transition-colors disabled:pointer-events-none disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        /** Principale, inchiostro pieno: uno solo per schermata. */
        default:
          "bg-inchiostro text-title font-semibold text-foglio hover:bg-inchiostro-scuro active:bg-inchiostro-scuro disabled:bg-carta-ombra disabled:text-grafite-tenue",
        /** Secondario: foglio con bordo riga. */
        outline:
          "border-riga bg-foglio text-base font-medium text-grafite hover:border-riga-forte active:bg-carta-ombra aria-expanded:bg-carta-ombra disabled:border-transparent disabled:bg-carta-ombra disabled:text-grafite-tenue",
        /** Tonale, su carta ombra. */
        secondary:
          "bg-carta-ombra text-base font-medium text-grafite hover:bg-riga/60 active:bg-riga aria-expanded:bg-riga/60 disabled:text-grafite-tenue",
        /** Solo testo d'inchiostro, per azioni minori ("Riprova", "Modifica"). */
        ghost:
          "rounded-sm bg-transparent text-base font-medium text-inchiostro hover:bg-inchiostro-velato/70 active:bg-inchiostro-velato aria-expanded:bg-inchiostro-velato disabled:text-grafite-tenue",
        /** Solo icona o testo grafite: frecce, menu, chiusure. Non porta inchiostro sulla pagina. */
        quiet:
          "bg-transparent text-base font-medium text-grafite hover:bg-carta-ombra active:bg-riga/70 aria-expanded:bg-carta-ombra disabled:text-grafite-tenue",
        /** Distruttivo: testo errore su foglio con bordo errore. */
        destructive:
          "border-errore bg-foglio text-base font-medium text-errore hover:bg-errore-velato active:bg-errore-velato disabled:border-riga disabled:bg-carta-ombra disabled:text-grafite-tenue",
        /** Distruttivo pieno: solo per il pulsante di conferma dentro un dialogo. */
        "destructive-solid":
          "bg-errore text-base font-semibold text-foglio hover:bg-errore-scuro active:bg-errore-scuro disabled:bg-carta-ombra disabled:text-grafite-tenue",
        link:
          "rounded-sm border-0 bg-transparent text-base font-medium text-inchiostro underline decoration-1 underline-offset-4 hover:decoration-2",
      },
      // Nessuna taglia scende sotto i 44px: i nomi restano quelli di shadcn per compatibilità.
      size: {
        default: "h-12 px-4",
        xs: "h-11 px-3 text-sm",
        sm: "h-11 px-3",
        lg: "h-13 px-5",
        icon: "size-11",
        "icon-xs": "size-11",
        "icon-sm": "size-11",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

// buttonVariants serve anche ai link con l'aspetto di pulsante (convenzione di shadcn/ui).
// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants }
