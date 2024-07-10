import cs from 'classnames';
import { forwardRef, useImperativeHandle, useRef } from 'react';

type Props = {
  width?: number;
  height?: number;
};

export const Video = forwardRef<HTMLVideoElement, Props>((props, ref) => {
  const { width, height } = props;

  const innerRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => innerRef.current!);

  return (
    <div
      ref={containerRef}
      className={cs(
        'relative overflow-hidden bg-red-500',
        width && height ? 'flex-initial' : 'flex-1',
      )}
      style={{ width, height }}>
      <video
        className="absolute object-fill"
        style={{ width, height }}
        width={width}
        height={height}
        autoPlay={true}
        ref={innerRef}
      />
    </div>
  );
});
