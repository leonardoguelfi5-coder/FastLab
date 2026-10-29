import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Campo di DESIGN.md §5: foglio, bordo 1px che resta visibile al sole, angoli 10px, alto 52px.
 * Focus: bordo d'inchiostro e anello velato, nessun bagliore. Errore: bordo errore con `aria-invalid`.
 */
const inputVariants = cva(
  "h-13 w-full min-w-0 rounded-md border border-riga-controllo bg-foglio px-3.5 text-grafite transition-colors outline-none hover:border-grafite-tenue focus:border-inchiostro focus:ring-3 focus:ring-inchiostro-velato aria-invalid:border-errore aria-invalid:focus:ring-errore-velato disabled:cursor-not-allowed disabled:border-riga disabled:bg-carta-ombra disabled:text-grafite-tenue [&::-webkit-date-and-time-value]:text-left",
  {
    variants: {
      variant: {
        /** Testo comune (email, nomi, note): Body. */
        default: "text-base",
        /** Numeri ed etichette delle piante: Geist Mono con cifre tabellari. */
        campo: "font-mono text-campo tabular-nums",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Input({
  className,
  type,
  variant,
  ...props
}: React.ComponentProps<"input"> & VariantProps<typeof inputVariants>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(inputVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Input }
