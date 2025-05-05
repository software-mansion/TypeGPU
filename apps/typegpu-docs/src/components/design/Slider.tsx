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
      className='bg-grayscale-20 h-10 rounded-[0.25rem] relative flex overflow-hidden'
    >
      <RadixSlider.Track className='flex-1 h-full'>
        <RadixSlider.Range className='absolute h-full bg-gradient-to-br from-gradient-purple to-gradient-blue' />
      </RadixSlider.Track>
      <div className='absolute left-1/2 top-1/2 translate-x-[-50%] translate-y-[-50%] text-xs text-center'>
        {value}
      </div>
    </RadixSlider.Root>
  );
}
