import { useAtom, useAtomValue } from 'jotai';
import { useState } from 'react';
import { codeEditorShownAtom } from '../utils/examples/codeEditorShownAtom';
import { exampleControlsAtom } from './ExampleView';
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
        <div>{label}</div>

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
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="flex justify-between">
      <div>{label}</div>

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
      <div>{label}</div>

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
  const [codeEditorShowing, setCodeEditorShowing] =
    useAtom(codeEditorShownAtom);
  const exampleControlParams = useAtomValue(exampleControlsAtom);

  console.log(exampleControlParams);

  return (
    <div className="flex flex-col gap-4 bg-grayscale-0 rounded-xl p-6">
      <h2 className="text-xl font-medium">Control panel</h2>

      <label className="flex gap-3 items-center justify-between cursor-pointer">
        <span>Hide code editor</span>
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
            min={param.options.min ?? 0}
            max={param.options.max ?? 10}
            step={param.options.step ?? 1}
            initial={param.options.initial ?? 0}
          />
        ) : 'options' in param.options ? (
          <DropdownRow
            label={param.label}
            key={param.label}
            options={param.options.options}
            initial={param.options.initial}
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
