import { useAtom, useAtomValue } from 'jotai';
import { useState } from 'react';
import { codeEditorShownAtom } from '../utils/examples/codeEditorShownAtom';
import {
  type ExampleControlParam,
  exampleControlsAtom,
} from '../utils/examples/exampleControlAtom';
import { menuShownAtom } from '../utils/examples/menuShownAtom';
import { Button } from './design/Button';
import { Select } from './design/Select';
import { Slider } from './design/Slider';
import { Switch } from './design/Switch';

function ToggleRow({
  label,
  initial,
  onChange,
}: {
  label: string;
  initial: boolean;
  onChange: (value: boolean) => void;
}) {
  const [value, setValue] = useState(initial);

  return (
    <>
      <div className="text-sm text-pretty text-ellipsis">{label}</div>

      <label className="grid justify-end items-center cursor-pointer h-10">
        <Switch
          checked={value}
          onChange={(e) => {
            onChange(e.target.checked);
            setValue(e.target.checked);
          }}
        />
      </label>
    </>
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
  return (
    <>
      <div className="text-sm text-pretty text-ellipsis">{label}</div>

      <Slider
        min={min ?? 0}
        max={max ?? 1}
        step={step ?? 0.1}
        initial={initial}
        onChange={onChange}
      />
    </>
  );
}

function SelectRow({
  label,
  initial,
  options,
  onChange,
}: {
  label: string;
  initial: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <>
      <div className="text-sm">{label}</div>

      <Select initial={initial} options={options} onChange={onChange} />
    </>
  );
}

function ButtonRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <>
      <div />
      <Button label={label} onClick={onClick} />
    </>
  );
}

function paramToControlRow(param: ExampleControlParam) {
  switch (param.type) {
    case 'select':
      return (
        <SelectRow
          label={param.label}
          key={param.label}
          options={param.options}
          initial={param.initial ?? 0}
          onChange={param.onChange}
        />
      );
    case 'toggle':
      return (
        <ToggleRow
          key={param.label}
          label={param.label}
          onChange={param.onChange}
          initial={param.initial}
        />
      );
    case 'slider':
      return (
        <SliderRow
          key={param.label}
          label={param.label}
          onChange={param.onChange}
          min={param.options.min}
          max={param.options.max}
          step={param.options.step}
          initial={param.initial}
        />
      );
    case 'button':
      return <ButtonRow label={param.label} onClick={param.onClick} />;
  }
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
      <div className="grid grid-cols-2 gap-4 items-center">
        {exampleControlParams.map((param) => paramToControlRow(param))}
      </div>
    </div>
  );
}
