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

  const getComponentValue = (vec: T, comp: 'x' | 'y' | 'z' | 'w'): number => {
    switch (comp) {
      case 'x':
        return 'x' in vec ? (vec.x as number) : 0;
      case 'y':
        return 'y' in vec ? (vec.y as number) : 0;
      case 'z':
        return 'z' in vec ? (vec.z as number) : 0;
      case 'w':
        return 'w' in vec ? (vec.w as number) : 0;
      default:
        return 0;
    }
  };

  const handleComponentChange = (
    componentName: 'x' | 'y' | 'z' | 'w',
    newValue: number,
  ) => {
    const newVec: Partial<d.v4f> = {};

    if ('x' in value) newVec.x = value.x;
    if ('y' in value) newVec.y = value.y;
    if ('z' in value) newVec.z = value.z;
    if ('w' in value) newVec.w = value.w;

    if (componentName === 'x' && 'x' in min) newVec.x = newValue;
    if (componentName === 'y' && 'y' in min) newVec.y = newValue;
    if (componentName === 'z' && 'z' in min) newVec.z = newValue;
    if (componentName === 'w' && 'w' in min) newVec.w = newValue;

    onChange(newVec as T);
  };

  return (
    <div className="flex flex-row gap-4 w-full">
      {components.map((component) => (
        <div key={component} className="flex items-center gap-2 flex-1">
          <div className="w-6 text-xs flex-shrink-0">{component}:</div>
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
      ))}
    </div>
  );
}
