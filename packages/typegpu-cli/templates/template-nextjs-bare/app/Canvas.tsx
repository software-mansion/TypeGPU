'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const CanvasInner = dynamic(() => import('./CanvasInner'), { ssr: false });

export default function Canvas({ className }: { className?: string }) {
  return <CanvasInner className={className} />;
}
