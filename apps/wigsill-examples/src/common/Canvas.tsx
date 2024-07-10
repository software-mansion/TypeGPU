import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import useEvent from './useEvent';

type Props = {
  width?: number;
  height?: number;
};

export const Canvas = forwardRef<HTMLCanvasElement, Props>((_props, ref) => {
  const innerRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => innerRef.current!);

  const onResize = useEvent(() => {
    if (!innerRef.current) {
      return;
    }

    const canvas = innerRef.current;
    const rect: DOMRect | null =
      canvas.parentNode && 'getBoundingClientRect' in canvas.parentNode
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (canvas.parentNode as any).getBoundingClientRect()
        : null;

    if (rect) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
  });

  useEffect(() => {
    onResize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, [onResize]);

  return (
    <div className="relative overflow-hidden flex-1 bg-red-500">
      <canvas className="absolute" ref={innerRef} />
    </div>
  );
});
