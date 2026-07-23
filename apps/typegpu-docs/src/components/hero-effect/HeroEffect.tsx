import { useEffect } from 'react';
import { initHeroEffect } from './hero-effect.ts';
import { useConfigureContext, useRoot, useRootOrError } from '@typegpu/react';

function HeroEffectWebGPU() {
  const root = useRoot();
  const { ref, ctxRef } = useConfigureContext({ alphaMode: 'premultiplied' });

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    let cancelled = false;
    let onCleanup: (() => void) | undefined;
    (async () => {
      const result = await initHeroEffect({ root, context: ctx });
      onCleanup = result.onCleanup;
      if (cancelled) {
        onCleanup();
      }
    })();

    return () => {
      cancelled = true;
      onCleanup?.();
      onCleanup = undefined;
    };
  }, [root]);

  return (
    <div className="relative h-[48rem] w-[48rem]">
      <canvas ref={ref} className="absolute inset-0 h-full w-full bg-transparent" />
    </div>
  );
}

export function HeroEffect() {
  const result = useRootOrError();

  if (result.status === 'rejected') {
    // Fallback
    return null;
  }

  return <HeroEffectWebGPU />;
}
