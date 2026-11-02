import React from 'react';
import type { Metadata } from 'next';

// oxlint-disable-next-line import/no-unassigned-import
import './globals.css';

export const metadata: Metadata = {
  title: 'typegpu-nextjs-bare-project',
  description: 'TypeGPU + Next.js',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
