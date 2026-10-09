import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'Onboarding Optacost' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
