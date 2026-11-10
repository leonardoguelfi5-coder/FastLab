import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/** Etichetta di stato, angoli 6px. Ogni colore accompagna un testo: mai solo colore. */
const badgeVariants = cva(
  "inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border border-transparent px-2 text-label whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3.5!",
  {
    variants: {
      variant: {
        default: "bg-inchiostro text-foglio",
        secondary: "bg-carta-ombra text-grafite",
        destructive: "bg-errore-velato text-errore",
        outline: "border-riga bg-foglio text-grafite",
        ghost: "text-grafite-tenue",
        link: "text-inchiostro underline underline-offset-4",
        /** Solo per l'esito "salvato". */
        registrato: "bg-registrato-velato text-registrato",
        /** Avvisi non bloccanti (fuori intervallo, "non oggi"). */
        attenzione: "bg-attenzione-velato text-attenzione",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

// eslint-disable-next-line react-refresh/only-export-components
export { Badge, badgeVariants }
