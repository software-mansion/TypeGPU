import { useEffect, useRef } from 'react';
import { initHeroEffect } from './hero-effect.ts';

export function HeroEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctrl = new AbortController();
    initHeroEffect({ canvas, signal: ctrl.signal });

    return () => {
      ctrl.abort();
    };
  });

  return (
    <div className='relative h-[48rem] w-[48rem]'>
      <canvas
        ref={canvasRef}
        className='absolute inset-0 h-full w-full bg-transparent'
      />
    </div>
  );
}
