type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function TextArea({ value, onChange }: Props) {
  return (
    <input
      className="relative box-border flex h-10 overflow-hidden rounded bg-tameplum-50 p-3"
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
