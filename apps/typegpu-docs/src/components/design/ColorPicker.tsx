import { d } from 'typegpu';

function hexToRgb(hex: string) {
  return d.vec3f(
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  );
}

function componentToHex(c: number) {
  const hex = (Math.floor(c * 255)).toString(16);
  return hex.length === 1 ? `0${hex}` : hex;
}

function rgbToHex(rgb: readonly [number, number, number]) {
  return `#${rgb.map(componentToHex).join('')}`;
}

type Props = {
  /**
   * RGB 0-1
   */
  value: d.v3f;
  onChange: (value: d.v3f) => void;
};

export function ColorPicker({ value, onChange }: Props) {
  return (
    <input
      value={rgbToHex(value)}
      className='h-10 w-full rounded bg-tameplum-50 p-1'
      type='color'
      onChange={(e) => onChange(hexToRgb(e.target.value))}
    />
  );
}
