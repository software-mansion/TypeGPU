import cs from 'classnames';
import { forwardRef } from 'react';

type Props = {
  width?: number;
  height?: number;
};

export const Video = forwardRef<HTMLVideoElement, Props>((props, ref) => {
  const { width, height } = props;

  return (
    <div
      className={cs(
        'relative overflow-hidden bg-black',
        width && height ? 'flex-initial' : 'self-stretch flex-1',
      )}
    >
      {/* biome-ignore lint/a11y/useMediaCaption: <captions not applicable, purely visual content> */}
      <video
        ref={ref}
        className={cs(
          'object-fill',
          width && height
            ? ''
            : 'absolute inset-0 self-stretch max-h-none aspect-auto',
        )}
        style={{ width, height }}
        width={width}
        height={height}
        autoPlay={true}
      />
    </div>
  );
});
