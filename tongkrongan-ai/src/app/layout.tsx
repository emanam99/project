import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'Tongkrongan AI',
  description: 'Grup Chat AI dengan Kepribadian Indonesia — Tongkrongan AI',
  keywords: ['AI', 'chat', 'Indonesia', 'grup chat', 'AI chat'],
  authors: [{ name: 'Tongkrongan AI' }],
  viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
  themeColor: '#111b21',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="dark">
      <body className={`${inter.className} bg-whatsapp-background text-whatsapp-text antialiased`}>
        {children}
      </body>
    </html>
  );
}
