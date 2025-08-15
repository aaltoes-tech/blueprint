import './globals.css'
import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Providers } from '@/components/providers'

export const metadata: Metadata = {
  title: 'Aaltoes RAG Assistant',
  description: 'Ask questions about Aaltoes board decisions and documents',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${GeistSans.className} ${GeistMono.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}