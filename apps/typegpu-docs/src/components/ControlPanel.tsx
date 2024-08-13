import { useAtom, useAtomValue } from 'jotai';
import { useState } from 'react';
import { codeEditorShownAtom } from '../utils/examples/codeEditorShownAtom';
import { exampleControlsAtom } from '../utils/examples/exampleControlAtom';
import { menuShownAtom } from '../utils/examples/menuShownAtom';
import { Switch } from './design/Switch';

function SwitchRow({
  label,
  initial,
  onChange,
}: { label: string; initial: boolean; onChange: (value: boolean) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <label className="cursor-pointer">
      <div className="flex justify-between">
        <div className="text-sm">{label}</div>

        <Switch
          checked={value}
          onChange={(e) => {
            onChange(e.target.checked);
            setValue(e.target.checked);
          }}
        />
      </div>
    </label>
  );
}

function SliderRow({
  label,
  initial,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  initial: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="flex justify-between">
      <div className="text-sm">{label}</div>

      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          onChange(Number.parseFloat(e.target.value));
          setValue(Number.parseFloat(e.target.value));
        }}
      />
    </div>
  );
}

function DropdownRow({
  label,
  initial,
  options,
  onChange,
}: {
  label: string;
  initial: string | number;
  options: (string | number)[];
  onChange: (value: string | number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="flex justify-between">
      <div className="text-sm">{label}</div>

      <select
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onChange(e.target.value);
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ControlPanel() {
  const [menuShowing, setMenuShowing] = useAtom(menuShownAtom);
  const [codeEditorShowing, setCodeEditorShowing] =
    useAtom(codeEditorShownAtom);
  const exampleControlParams = useAtomValue(exampleControlsAtom);

  return (
    <div className="flex flex-col gap-4 bg-grayscale-0 rounded-xl p-6">
      <h2 className="text-xl font-medium">Control panel</h2>

      <label className="flex gap-3 items-center justify-between cursor-pointer text-sm">
        <span>Show left menu</span>
        <Switch
          checked={menuShowing}
          onChange={(e) => setMenuShowing(e.target.checked)}
        />
      </label>

      <label className="flex gap-3 items-center justify-between cursor-pointer text-sm">
        <span>Show code editor</span>
        <Switch
          checked={codeEditorShowing}
          onChange={(e) => setCodeEditorShowing(e.target.checked)}
        />
      </label>

      <hr />

      <h2 className="text-xl font-medium">Example controls</h2>
      {exampleControlParams.map((param) =>
        typeof param.options.initial === 'boolean' ? (
          <SwitchRow
            key={param.label}
            label={param.label}
            onChange={param.onChange}
            initial={param.options.initial}
          />
        ) : 'min' in param.options ? (
          <SliderRow
            key={param.label}
            label={param.label}
            onChange={param.onChange}
            min={param.options.min}
            max={param.options.max}
            step={param.options.step}
            initial={param.options.initial}
          />
        ) : 'options' in param.options ? (
          <DropdownRow
            label={param.label}
            key={param.label}
            options={param.options.options}
            initial={param.options.initial ?? 0}
            onChange={param.onChange}
          />
        ) : (
          <div className="flex justify-between" key={param.label}>
            <div>{param.label}</div>
          </div>
        ),
      )}
    </div>
  );
}
