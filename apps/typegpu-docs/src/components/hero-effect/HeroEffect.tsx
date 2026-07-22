import { useEffect } from 'react';
import { initHeroEffect } from './hero-effect.ts';
import { useConfigureContext, useRootOrError } from '@typegpu/react';

export function HeroEffect() {
  const result = useRootOrError();
  const { ref, ctxRef } = useConfigureContext({ alphaMode: 'premultiplied' });

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || result.status === 'rejected') return;
    const root = result.value;

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
  }, [result]);

  return (
    <div className="relative h-[48rem] w-[48rem]">
      <canvas ref={ref} className="absolute inset-0 h-full w-full bg-transparent" />
    </div>
  );
}
