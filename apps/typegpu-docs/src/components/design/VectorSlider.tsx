import * as RadixSlider from '@radix-ui/react-slider';

type Props = {
  min: number[];
  max: number[];
  step: number[];
  value: number[];
  onChange: (value: number[]) => void;
};

export function VectorSlider({ min, max, step, value, onChange }: Props) {
  const handleComponentChange = (index: number, newValue: number) => {
    onChange([...value.slice(0, index), newValue, ...value.slice(index + 1)]);
  };

  const renderSlider = (index: number) => (
    <div key={index} className="flex flex-1 items-center">
      <RadixSlider.Root
        value={[value[index]]}
        min={min[index]}
        max={max[index]}
        step={step[index]}
        onValueChange={(values) => handleComponentChange(index, values[0])}
        className="relative flex h-10 flex-1 touch-none overflow-hidden rounded bg-grayscale-20"
      >
        <RadixSlider.Track className="h-full flex-1">
          <RadixSlider.Range className="absolute h-full bg-gradient-to-br from-gradient-purple to-gradient-blue" />
        </RadixSlider.Track>
        <div className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 text-center text-xs">
          {value[index].toFixed(2)}
        </div>
      </RadixSlider.Root>
    </div>
  );

  const containerClass = 'flex w-full';
  const rowClass = 'flex flex-row gap-4 w-full';

  return value.length === 4 ? (
    <div className={`${containerClass} flex-col gap-2`}>
      <div className={rowClass}>{[0, 1].map(renderSlider)}</div>
      <div className={rowClass}>{[2, 3].map(renderSlider)}</div>
    </div>
  ) : (
    <div className={`${containerClass} flex-row gap-1`}>
      {value.map((_, index) => renderSlider(index))}
    </div>
  );
}
