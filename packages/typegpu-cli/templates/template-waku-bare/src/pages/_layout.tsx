// oxlint-disable-next-line no-unassigned-import
import '../styles.css';

import React, { type ReactNode } from 'react';

type RootLayoutProps = { children: ReactNode };

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <div className="h-full antialiased font-sans">
      <title>typegpu-waku-bare-project</title>
      <meta name="description" content="TypeGPU + Waku" />
      <link rel="icon" type="image/x-icon" href="/images/favicon.ico" />
      <div className="flex min-h-full flex-col">{children}</div>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
