import cs from 'classnames';
import { useAtom, useAtomValue } from 'jotai';
import { useState } from 'react';
import { codeEditorShownAtom } from '../utils/examples/codeEditorShownAtom';
import {
  type ExampleControlParam,
  exampleControlsAtom,
} from '../utils/examples/exampleControlAtom';
import { menuShownAtom } from '../utils/examples/menuShownAtom';
import { isGPUSupported } from '../utils/isGPUSupported';
import { Button } from './design/Button';
import { Select } from './design/Select';
import { Slider } from './design/Slider';
import { Toggle } from './design/Toggle';

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
      <div className="text-sm">{label}</div>

      <label className="grid items-center justify-end h-10 cursor-pointer">
        <Toggle
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
  const [value, setValue] = useState(initial);

  return (
    <>
      <div className="text-sm">{label}</div>

      <Slider
        min={min ?? 0}
        max={max ?? 1}
        step={step ?? 0.1}
        value={value}
        onChange={(newValue) => {
          setValue(newValue);
          onChange(newValue);
        }}
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
  const [value, setValue] = useState(initial);

  return (
    <>
      <div className="text-sm">{label}</div>

      <Select
        value={value}
        options={options}
        onChange={(newValue) => {
          setValue(newValue);
          onChange(newValue);
        }}
      />
    </>
  );
}

function ButtonRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="grid h-10 col-span-2">
      <Button onClick={onClick}>{label}</Button>
    </div>
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
      return (
        <ButtonRow
          key={param.label}
          label={param.label}
          onClick={param.onClick}
        />
      );
  }
}

export function ControlPanel() {
  const [menuShowing, setMenuShowing] = useAtom(menuShownAtom);
  const [codeEditorShowing, setCodeEditorShowing] =
    useAtom(codeEditorShownAtom);
  const exampleControlParams = useAtomValue(exampleControlsAtom);

  return (
    <div
      className={cs(
        isGPUSupported ? '' : 'hidden md:flex',
        'box-border flex flex-col gap-4 p-6 bg-grayscale-0 rounded-xl max-h-[50%] md:max-h-full',
      )}
    >
      <div className="hidden md:flex flex-col gap-4">
        <h2 className="text-xl font-medium">Control panel</h2>
        <label className="flex items-center justify-between gap-3 text-sm cursor-pointer">
          <span>Show left menu</span>
          <Toggle
            checked={menuShowing}
            onChange={(e) => setMenuShowing(e.target.checked)}
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm cursor-pointer">
          <span>Show code editor</span>
          <Toggle
            checked={codeEditorShowing}
            onChange={(e) => setCodeEditorShowing(e.target.checked)}
          />
        </label>

        <hr className="my-0 box-border w-full border-t border-tameplum-100" />
      </div>

      {isGPUSupported ? (
        <>
          <h2 className="m-0 text-xl font-medium">Example controls</h2>
          <div className="grid items-center grid-cols-2 gap-4 overflow-auto p-1 pb-2">
            {exampleControlParams.map((param) => paramToControlRow(param))}
          </div>
        </>
      ) : null}
    </div>
  );
}
