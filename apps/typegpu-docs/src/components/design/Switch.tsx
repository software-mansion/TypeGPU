import type { ChangeEventHandler } from 'react';

type Props = {
  checked: boolean;
  onChange?: ChangeEventHandler<HTMLInputElement>;
};

export function Switch(props: Props) {
  const { checked, onChange } = props;

  return (
    <>
      <input
        type="checkbox"
        checked={checked}
        className="sr-only peer"
        onChange={onChange}
      />
      <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-gradient-blue rounded-full peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-br peer-checked:from-gradient-purple peer-checked:to-gradient-blue" />
    </>
  );
}
