function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function componentToHex(c: number) {
  const hex = (c * 255).toString(16);
  return hex.length === 1 ? `0${hex}` : hex;
}

function rgbToHex(rgb: [number, number, number]) {
  return `#${rgb.map(componentToHex).join('')}`;
}

type Props = {
  value: [number, number, number];
  onChange: (value: [number, number, number]) => void;
};

export function ColorPicker({ value, onChange }: Props) {
  return (
    <input
      value={rgbToHex(value)}
      className="w-full h-10 p-1 rounded bg-tameplum-50"
      type="color"
      onChange={(e) => onChange(hexToRgb(e.target.value))}
    />
  );
}
