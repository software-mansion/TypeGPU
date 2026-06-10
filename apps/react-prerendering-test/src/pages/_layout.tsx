import type { ReactNode } from 'react';

// oxlint-disable-next-line no-unassigned-import
import '../styles.css';

type RootLayoutProps = { children: ReactNode };

export default function RootLayout({ children }: RootLayoutProps) {
  return <main className="bg-black">{children}</main>;
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
