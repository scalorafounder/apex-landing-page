import type { Metadata } from 'next'
import { Montserrat, Lato } from 'next/font/google'
import './globals.css'

const montserrat = Montserrat({
  weight: ['600', '700', '800', '900'],
  subsets: ['latin'],
  variable: '--font-display',
})

const lato = Lato({
  weight: ['300', '400', '700'],
  subsets: ['latin'],
  variable: '--font-body',
})

export const metadata: Metadata = {
  title: 'Real Deal Wholesale — Pre-Foreclosure Leads',
  description: 'Get fresh pre-foreclosure leads delivered in 24 hours. Built for serious wholesalers.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${montserrat.variable} ${lato.variable}`}>
      <body className="bg-dark-900 text-white font-body antialiased">
        {children}
      </body>
    </html>
  )
}
