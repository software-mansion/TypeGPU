import { forwardRef, useImperativeHandle, useRef } from 'react';

type Props = {
  width?: number;
  height?: number;
};

export const Video = forwardRef<HTMLVideoElement, Props>((_props, ref) => {
  const innerRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => innerRef.current!);

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden flex-1 bg-red-500">
      <video className="absolute" autoPlay={true} ref={innerRef} />
    </div>
  );
});
