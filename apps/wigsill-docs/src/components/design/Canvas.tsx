import cs from 'classnames';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import useEvent from '../../utils/useEvent';

type Props = {
  width?: number;
  height?: number;
  aspectRatio?: number;
};

export const Canvas = forwardRef<HTMLCanvasElement, Props>((props, ref) => {
  const { width, height, aspectRatio } = props;
  const innerRef = useRef<HTMLCanvasElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => innerRef.current as HTMLCanvasElement);

  const onResize = useEvent(() => {
    const canvas = innerRef.current;
    const container = sizerRef.current;

    if (!canvas || !container) {
      return;
    }

    canvas.width = Math.max(1, container.clientWidth);
    canvas.height = Math.max(1, container.clientHeight);
  });

  useEffect(() => {
    onResize();
    // Size is wrong when loading the page zoomed-in, so we reset the size a bit after mounting.
    setTimeout(() => {
      onResize();
    }, 1);

    const resizeObserver = new ResizeObserver(() => onResize());
    const container = sizerRef.current;
    if (container) {
      resizeObserver.observe(container);
    }

    return () => {
      if (container) {
        resizeObserver.unobserve(container);
      }
    };
  }, [onResize]);

  return (
    <div
      style={{ containerType: aspectRatio ? 'size' : undefined }}
      className={cs(
        'flex',
        (width && height) || aspectRatio
          ? 'flex-initial'
          : 'flex-1 self-stretch',
        aspectRatio && 'flex-col items-center justify-center w-full h-full',
      )}
    >
      <div
        ref={sizerRef}
        className={cs(
          'relative',
          (width && height) || aspectRatio
            ? 'flex-initial'
            : 'flex-1 self-stretch',
          aspectRatio && 'w-[min(100cqw,100cqh)]',
        )}
        style={{ width, height, aspectRatio }}
      >
        <canvas className="absolute" ref={innerRef} />
      </div>
    </div>
  );
});
