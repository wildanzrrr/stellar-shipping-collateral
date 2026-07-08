"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

// Light-only: dark mode is disabled (forcedTheme wins over any stored or
// system preference). The `.dark` token blocks stay in tokens.css as a
// dormant capability — re-enable by restoring defaultTheme/enableSystem.
function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      forcedTheme="light"
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}

export { ThemeProvider }
