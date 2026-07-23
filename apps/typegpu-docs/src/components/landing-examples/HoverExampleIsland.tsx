import { useAtom } from 'jotai';
import { useRootOrError } from '@typegpu/react';
import React, { Suspense, useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, TouchEvent as ReactTouchEvent } from 'react';

import ExternalOpenSvg from '../../assets/externalopen.svg';
import { activeExampleAtom } from '../../utils/examples/activeExampleAtom.ts';

interface HoverExampleIslandProps {
  exampleKey: string;
  title: string;
  previewImageSrc: string;
  liveComponent: React.ReactNode;
}

export default function HoverExampleIsland({
  exampleKey,
  title,
  previewImageSrc,
  liveComponent,
}: HoverExampleIslandProps) {
  const root = useRootOrError();
  const webgpuSupported = root.status === 'fulfilled';
  const rootRef = useRef<HTMLDivElement | null>(null);
  const twoFingerActiveRef = useRef(false);

  const [activeExample, setActiveExample] = useAtom(activeExampleAtom);

  const isActive = activeExample === exampleKey;

  const activate = useCallback(() => setActiveExample(exampleKey), [exampleKey]);
  const deactivate = useCallback(
    () => setActiveExample((prev) => (prev === exampleKey ? null : prev)),
    [exampleKey],
  );

  const handlePointerEnter = (e: ReactPointerEvent) => e.pointerType !== 'touch' && activate();
  const handlePointerLeave = (e: ReactPointerEvent) => e.pointerType !== 'touch' && deactivate();
  const handleTouchStart = (e: ReactTouchEvent) => {
    if (e.touches.length >= 2) {
      e.preventDefault();
      twoFingerActiveRef.current = true;
    }
  };
  const handleTouchMove = (e: ReactTouchEvent) => {
    if (twoFingerActiveRef.current) e.preventDefault();
  };
  const handleTouchEnd = (e: ReactTouchEvent) => {
    if (e.touches.length === 0 && twoFingerActiveRef.current) {
      twoFingerActiveRef.current = false;
      setActiveExample((prev) => (prev === exampleKey ? null : exampleKey));
    }
  };
  const handleTouchCancel = () => {
    twoFingerActiveRef.current = false;
  };

  return (
    <div
      className="group relative aspect-square overflow-hidden"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      style={{ touchAction: 'pan-x pan-y' }}
    >
      <a
        href={`/TypeGPU/examples/#example=${exampleKey}`}
        className="absolute inset-x-6 bottom-6 z-10 flex h-16 items-center justify-between gap-3 bg-white px-4 text-blue-900 no-underline"
      >
        <span className="max-w-[70%] truncate text-sm font-medium">{title}</span>
        <img
          src={ExternalOpenSvg.src}
          alt="Open example"
          className="h-6 w-6 flex-shrink-0"
          loading="lazy"
        />
      </a>

      <img
        src={previewImageSrc}
        alt={title}
        className="h-full w-full object-cover transition duration-300 ease-out"
      />

      {webgpuSupported && (
        <div
          data-active={isActive}
          className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition duration-300 ease-out group-hover:pointer-events-auto group-hover:opacity-100 data-[active=true]:pointer-events-auto data-[active=true]:opacity-100"
        >
          <div className="pointer-events-auto h-full w-full backdrop-blur">
            <div ref={rootRef} className="relative h-full w-full overflow-hidden">
              <Suspense fallback={<></>}>{isActive ? liveComponent : null}</Suspense>
              {/*{error ? (
              <p className="absolute inset-0 flex items-center justify-center text-center text-sm font-medium text-white">
                {error}
              </p>
            ) : null}
            {isLoading ? (
              <div className="absolute inset-0 flex h-full w-full items-center justify-center">
                <span className="animate-pulse text-center text-xs font-medium tracking-widest text-white/60 uppercase">
                  Loading...
                </span>
              </div>
            ) : null}*/}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
