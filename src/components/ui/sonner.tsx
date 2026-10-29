import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckIcon, InfoIcon, TriangleAlertIcon, CircleAlertIcon, Loader2Icon } from "lucide-react"

/**
 * Toast di DESIGN.md: fondo grafite, testo foglio, angoli 10px, ombra galleggiante (index.css).
 * Stanno in basso, sopra la barra d'azione se la pagina ne ha una (`--altezza-barra-azioni`, vedi BarraAzioni).
 */
const SOPRA_LA_BARRA = "calc(var(--altezza-barra-azioni, 0px) + 16px)"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="bottom-center"
      offset={{ bottom: SOPRA_LA_BARRA }}
      mobileOffset={{ bottom: SOPRA_LA_BARRA }}
      className="toaster group"
      icons={{
        success: (
          <CheckIcon className="size-5" strokeWidth={2.5} />
        ),
        info: (
          <InfoIcon className="size-5" />
        ),
        warning: (
          <TriangleAlertIcon className="size-5" />
        ),
        error: (
          <CircleAlertIcon className="size-5" />
        ),
        loading: (
          <Loader2Icon className="size-5 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--grafite)",
          "--normal-text": "var(--foglio)",
          "--normal-border": "var(--grafite)",
          "--border-radius": "10px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
