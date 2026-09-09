import { useEffect, useRef, useState } from 'react';
import { useRootOrError } from '@typegpu/react';
import type { TgpuRoot } from 'typegpu';
import { initHeroEffect } from './hero-effect.ts';

function HeroEffectCanvas({ root }: { root?: TgpuRoot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    let ownedRoot: TgpuRoot | undefined;
    let onCleanup: (() => void) | undefined;
    const resize = () => {
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * window.devicePixelRatio));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * window.devicePixelRatio));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    setIsActive(false);

    void (async () => {
      try {
        const effectRoot = root ?? (ownedRoot = (await import('@typegpu/gl')).initWithGL());
        if (cancelled) {
          ownedRoot?.destroy();
          return;
        }
        const context = effectRoot.configureContext({ canvas, alphaMode: 'premultiplied' });
        const result = await initHeroEffect({ root: effectRoot, context });
        if (cancelled) {
          result.onCleanup();
          ownedRoot?.destroy();
          return;
        }
        onCleanup = () => result.onCleanup();
        setIsActive(true);
      } catch (error) {
        ownedRoot?.destroy();
        if (!cancelled) console.warn('Unable to initialize the landing effect', error);
      }
    })();

    return () => {
      cancelled = true;
      observer.disconnect();
      onCleanup?.();
      // Initialization may still be loading the model; let it finish before disposal.
      if (onCleanup) ownedRoot?.destroy();
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
  return (
    <HeroEffectCanvas
      key={result.status}
      root={result.status === 'fulfilled' ? result.value : undefined}
    />
  );
}
