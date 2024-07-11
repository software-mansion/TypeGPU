import cs from 'classnames';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import useEvent from './useEvent';

type Props = {
  width?: number;
  height?: number;
};

export const Canvas = forwardRef<HTMLCanvasElement, Props>((props, ref) => {
  const { width, height } = props;
  const innerRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => innerRef.current!);

  const onResize = useEvent(() => {
    const canvas = innerRef.current;
    const container = containerRef.current;

    if (!canvas || !container) {
      return;
    }

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
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
      className={cs(
        'relative overflow-hidden',
        width && height ? 'flex-initial' : 'flex-1 self-stretch',
      )}
      style={{ width, height }}>
      <canvas className="absolute" ref={innerRef} />
    </div>
  );
});
