import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system", resolvedTheme } = useTheme()
  const isDark = (resolvedTheme || theme) === "dark"

  return (
    <Sonner
        theme={theme as ToasterProps["theme"]}
        className="toaster group"
        icons={{
          success: <CircleCheckIcon className="size-4" />,
          info: <InfoIcon className="size-4" />,
          warning: <TriangleAlertIcon className="size-4" />,
          error: <OctagonXIcon className="size-4" />,
          loading: <Loader2Icon className="size-4 animate-spin" />,
        }}
        style={{
          // stronger, semi-opaque background to avoid blending with page content
          "--normal-bg": isDark ? "rgba(15,23,42,0.95)" : "rgba(255,255,255,0.98)",
          "--normal-text": isDark ? "rgba(255,255,255,0.96)" : "rgba(17,24,39,0.96)",
          "--normal-border": isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)",
          "--border-radius": "10px",
          // additional inline styles for contrast and stacking
          boxShadow: isDark ? "0 10px 30px rgba(2,6,23,0.7)" : "0 8px 24px rgba(2,6,23,0.12)",
          zIndex: 9999,
          backdropFilter: "saturate(140%) blur(6px)",
        } as React.CSSProperties}
        {...props}
      />
    )
}
export { Toaster }