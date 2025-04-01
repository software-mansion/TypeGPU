import * as RadixSlider from '@radix-ui/react-slider';
import type * as d from 'typegpu/data';

type Props<T extends d.AnyVecInstance> = {
  min: T;
  max: T;
  step: T;
  value: T;
  onChange: (value: T) => void;
};

export function VectorSlider<T extends d.AnyVecInstance>({
  min,
  max,
  step,
  value,
  onChange,
}: Props<T>) {
  const components: Array<'x' | 'y' | 'z' | 'w'> = [];
  if ('x' in min) components.push('x');
  if ('y' in min) components.push('y');
  if ('z' in min) components.push('z');
  if ('w' in min) components.push('w');

  const getComponentValue = (vec: T, comp: 'x' | 'y' | 'z' | 'w'): number =>
    comp in vec
      ? ((vec as unknown as Record<'x' | 'y' | 'z' | 'w', number | undefined>)[
          comp
        ] ?? 0)
      : 0;

  const handleComponentChange = (
    componentName: 'x' | 'y' | 'z' | 'w',
    newValue: number,
  ) => {
    const newVec: Partial<d.v4f> = {};
    if ('x' in value) newVec.x = value.x;
    if ('y' in value) newVec.y = value.y;
    if ('z' in value) newVec.z = value.z;
    if ('w' in value) newVec.w = value.w;

    if (componentName in min) {
      newVec[componentName] = newValue;
    }

    onChange(newVec as T);
  };

  const renderSlider = (component: 'x' | 'y' | 'z' | 'w') => (
    <div key={component} className={'flex items-center flex-1'}>
      <RadixSlider.Root
        value={[getComponentValue(value, component)]}
        min={getComponentValue(min, component)}
        max={getComponentValue(max, component)}
        step={getComponentValue(step, component)}
        onValueChange={(values) => {
          handleComponentChange(component, values[0]);
        }}
        className="bg-grayscale-20 h-10 rounded-[0.25rem] relative flex overflow-hidden flex-1"
      >
        <RadixSlider.Track className="flex-1 h-full">
          <RadixSlider.Range className="absolute h-full bg-gradient-to-br from-gradient-purple to-gradient-blue" />
        </RadixSlider.Track>
        <div className="absolute left-1/2 top-1/2 translate-x-[-50%] translate-y-[-50%] text-xs text-center">
          {getComponentValue(value, component).toFixed(2)}
        </div>
      </RadixSlider.Root>
    </div>
  );

  if (components.length === 4) {
    return (
      <div className="flex flex-col gap-2 w-full">
        <div className="flex flex-row gap-4 w-full">
          {components.slice(0, 2).map((component) => renderSlider(component))}
        </div>
        <div className="flex flex-row gap-4 w-full">
          {components.slice(2, 4).map((component) => renderSlider(component))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-row gap-1 w-full">
      {components.map((component) => renderSlider(component))}
    </div>
  );
}
