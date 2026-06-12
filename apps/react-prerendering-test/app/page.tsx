'use client';

import dynamic from 'next/dynamic';
import Shader from '../components/Shader.tsx';

const ShaderNoSSR = dynamic(() => import('../components/Shader.tsx'), {
  ssr: false,
});

export default function Page() {
  return process.env.DISABLE_SSR ? <ShaderNoSSR /> : <Shader />;
}
