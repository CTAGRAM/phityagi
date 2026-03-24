import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/layout/Sidebar';

export const metadata: Metadata = {
  title: 'Philosophy Series Engine',
  description: 'Transform philosophical corpora into coherent, citation-backed essay series with AI-powered research and writing.',
  keywords: ['philosophy', 'AI', 'essay', 'corpus', 'research', 'citations'],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-black text-white antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 min-w-0 overflow-x-hidden">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
