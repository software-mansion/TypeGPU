import { useEffect, useState } from 'react';
import { initHeroEffect } from './hero-effect.ts';
import { useConfigureContext, useRoot, useRootOrError } from '@typegpu/react';

function HeroEffectWebGPU() {
  const root = useRoot();
  const { ref, ctxRef } = useConfigureContext({ alphaMode: 'premultiplied' });
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    let cancelled = false;
    let onCleanup: (() => void) | undefined;
    void (async () => {
      const result = await initHeroEffect({ root, context: ctx });
      onCleanup = () => result.onCleanup();
      if (cancelled) {
        onCleanup();
        return;
      }

      setIsActive(true);
    })();

    return () => {
      cancelled = true;
      onCleanup?.();
      onCleanup = undefined;
    };
  }, [root]);

  return (
    <div
      data-active={isActive}
      className="relative h-[48rem] w-[48rem] opacity-0 data-[active=true]:opacity-100 transition-opacity ease-in-out duration-1000"
    >
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
