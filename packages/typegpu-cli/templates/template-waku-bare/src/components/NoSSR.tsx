'use client';

import { type ReactNode, useEffect, useState } from 'react';

export function NoSSR({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
}
