type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function TextArea({ value, onChange }: Props) {
  return (
    <input
      className="bg-tameplum-50 dark:bg-[#1b1f2c] dark:text-white relative box-border flex h-7 overflow-hidden rounded-md p-3 outline-none focus:ring-2 focus:ring-accent-600"
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
