import React, { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, TouchEvent as ReactTouchEvent } from 'react';

import ExternalOpenSvg from '../../assets/externalopen.svg';
import { WebGPUErrorBoundary } from '../WebGPUErrorBoundary.tsx';
import { isGPUSupported } from '../../utils/isGPUSupported.ts';
import { useHydrated } from '../../utils/useHydrated.ts';

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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const twoFingerActiveRef = useRef(false);
  const isHydrated = useHydrated();

  const [isActive, setIsActive] = useState(false);

  const activate = useCallback(() => setIsActive(true), []);
  const deactivate = useCallback(() => setIsActive(false), []);

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
      setIsActive((prev) => !prev);
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

      <img src={previewImageSrc} alt={title} className="h-full w-full object-cover" />

      <div
        ref={rootRef}
        data-live={isHydrated && isGPUSupported}
        className="backdrop-blur absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 ease-out group-hover:data-[live=true]:opacity-100"
      >
        <WebGPUErrorBoundary fallback={<></>}>
          {isHydrated && isGPUSupported && isActive ? liveComponent : null}
        </WebGPUErrorBoundary>
      </div>
    </div>
  );
}
