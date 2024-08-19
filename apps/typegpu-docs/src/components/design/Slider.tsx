import { type MouseEvent, useCallback, useEffect, useState } from 'react';

type Props = {
  min: number;
  max: number;
  step: number;
  initial: number;
  onChange: (value: number) => void;
};

export function Slider({ min, max, step, initial, onChange }: Props) {
  const [value, setValue] = useState(initial);
  const [mouseDown, setMouseDown] = useState(false);

  useEffect(() => {
    onChange(value);
  }, [value, onChange]);

  useEffect(() => {
    window.addEventListener('mouseup', () => {
      setMouseDown(false);
    });
  }, []);

  const onUserInput = useCallback(
    (e: MouseEvent) => {
      const rect = (
        e.nativeEvent.target as HTMLDivElement
      ).getBoundingClientRect();
      const clickedXRatio = (e.clientX - rect.x) / rect.width;
      const value = min + clickedXRatio * (max - min);
      const rounded = Math.round(value / step) * step;
      setValue(rounded);
    },
    [max, min, step],
  );

  return (
    <div
      className="grid relative bg-grayscale-20 items-center h-10 rounded-[0.25rem] overflow-hidden cursor-ew-resize"
      onMouseDown={() => {
        setMouseDown(true);
      }}
      onMouseMove={(e) => {
        if (mouseDown) {
          onUserInput(e);
        }
      }}
      onClick={(e) => {
        onUserInput(e);
      }}
      onKeyDown={() => {}}>
      <div
        style={{
          width: `${((value - min) / (max - min)) * 100}%`,
        }}
        className="col-start-1 row-start-1 bg-gradient-to-br from-gradient-purple to-gradient-blue h-full"
      />
      <div className="col-start-1 row-start-1 text-center select-none">
        {Number.isInteger(value) ? value : value.toPrecision(1)}
      </div>
    </div>
  );
}
