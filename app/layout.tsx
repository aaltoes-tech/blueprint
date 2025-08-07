import './globals.css'
import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'

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
      <body className={`${GeistSans.className} antialiased`}>{children}</body>
    </html>
  )
}