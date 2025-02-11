type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function TextArea({ value, onChange }: Props) {
  return (
    <input 
      type="text" 
      value={value}
      onChange = {(event) => onChange(event.target.value)}
    />
  );
}
