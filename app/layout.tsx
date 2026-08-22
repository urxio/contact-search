import type React from "react"
import "@/app/globals.css"
import { Inter } from "next/font/google"
import { EnhancedThemeProvider } from "@/components/enhanced-theme-provider"
import { Toaster } from "sonner"

const inter = Inter({ subsets: ["latin"] })

export const metadata = {
  title: {
    default: "Name Search",
    template: "%s · Name Search",
  },
  description: "A private congregation workspace for contact search and team progress.",
  generator: "Name Search",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
      </head>
      <body className={inter.className}>
        <EnhancedThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          storageKey="contact-search-theme"
        >
          {children}
          <Toaster position="bottom-center" richColors />
        </EnhancedThemeProvider>
      </body>
    </html>
  )
}
