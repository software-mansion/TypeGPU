'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const ShaderInner = dynamic(() => import('./ShaderInner.tsx'), { ssr: false });

export default function Canvas({ className }: { className?: string }) {
  return <ShaderInner className={className} />;
}
