'use client'

import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "./theme-provider"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider defaultTheme="system" storageKey="blueprint-theme">
      <SessionProvider>{children}</SessionProvider>
    </ThemeProvider>
  )
}