import * as RadixSlider from '@radix-ui/react-slider';

type Props = {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
};

export function Slider({ min, max, step, value, onChange }: Props) {
  return (
    <RadixSlider.Root
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(value) => {
        onChange(value[0]);
      }}
      className="dark:bg-white/10 relative flex h-7 touch-none overflow-hidden rounded-md bg-grayscale-20"
    >
      <RadixSlider.Track className="bg-tameplum-50 dark:bg-white/10 h-full flex-1">
        <RadixSlider.Range className="absolute h-full bg-gradient-to-br from-gradient-purple to-gradient-blue" />
      </RadixSlider.Track>
      <div className="absolute top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] text-center text-xs">
        {value}
      </div>
    </RadixSlider.Root>
  );
}
