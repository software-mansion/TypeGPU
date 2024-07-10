import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import useEvent from './useEvent';

type Props = {
  width?: number;
  height?: number;
};

export const Canvas = forwardRef<HTMLCanvasElement, Props>((_props, ref) => {
  const innerRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => innerRef.current!);

  const onResize = useEvent(() => {
    const canvas = innerRef.current;
    const container = containerRef.current;

    if (!canvas || !container) {
      return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;

    if (width && height) {
      canvas.width = width;
      canvas.height = height;
    }
  });

  useEffect(() => {
    onResize();
    // Size is wrong when loading the page zoomed-in, so we reset the size a bit after mounting.
    setTimeout(() => {
      onResize();
    }, 1);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, [onResize]);

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden flex-1 bg-red-500">
      <canvas className="absolute" ref={innerRef} />
    </div>
  );
});
