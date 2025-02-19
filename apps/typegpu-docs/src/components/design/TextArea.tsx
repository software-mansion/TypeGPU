type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function TextArea({ value, onChange }: Props) {
  return (
    <input
      className="box-border p-3 bg-grayscale-20 h-10 rounded-[0.25rem] relative flex overflow-hidden"
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
