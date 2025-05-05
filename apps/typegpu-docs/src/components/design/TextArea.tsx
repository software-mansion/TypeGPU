type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function TextArea({ value, onChange }: Props) {
  return (
    <input
      className="box-border p-3 bg-tameplum-50 h-10 rounded-[0.25rem] relative flex overflow-hidden"
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
