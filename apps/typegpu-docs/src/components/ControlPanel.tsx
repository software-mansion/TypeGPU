import cs from 'classnames';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useId, useState } from 'react';
import { runWithCatchAtom } from '../utils/examples/currentSnackbarAtom.ts';
import {
  type ExampleControlParam,
  exampleControlsAtom,
} from '../utils/examples/exampleControlAtom.ts';
import { codeEditorShownAtom, menuShownAtom } from '../utils/examples/exampleViewStateAtoms.ts';
import { isGPUSupported } from '../utils/isGPUSupported.ts';
import { Button } from './design/Button.tsx';
import { ColorPicker } from './design/ColorPicker.tsx';
import { Select } from './design/Select.tsx';
import { Slider } from './design/Slider.tsx';
import { TextArea } from './design/TextArea.tsx';
import { Toggle } from './design/Toggle.tsx';
import { VectorSlider } from './design/VectorSlider.tsx';
import { FPSCounter } from './FpsCounter.tsx';
import type { d } from 'typegpu';

function ToggleRow({
  label,
  initial = false,
  onChange,
}: {
  label: string;
  initial: boolean;
  onChange: (value: boolean) => void;
}) {
  const [value, setValue] = useState(initial);
  const runWithCatch = useSetAtom(runWithCatchAtom);

  const toggleId = useId();

  return (
    <>
      <div className="text-sm">{label}</div>

      <label htmlFor={toggleId} className="grid h-10 cursor-pointer items-center justify-end">
        <Toggle
          id={toggleId}
          checked={value}
          onChange={(e) => {
            setValue(e.target.checked);
            void runWithCatch(() => onChange(e.target.checked));
          }}
        />
      </label>
    </>
  );
}

function SliderRow({
  label,
  initial,
  min = 0,
  max = 1,
  step = 0.1,
  onChange,
}: {
  label: string;
  initial: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const [value, setValue] = useState(initial ?? min);
  const runWithCatch = useSetAtom(runWithCatchAtom);

  return (
    <>
      <div className="text-sm">{label}</div>

      <Slider
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(newValue) => {
          setValue(newValue);
          void runWithCatch(() => onChange(newValue));
        }}
      />
    </>
  );
}

function VectorSliderRow({
  label,
  initial,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  initial: number[];
  min: number[];
  max: number[];
  step: number[];
  onChange: (value: number[]) => void;
}) {
  const [value, setValue] = useState<number[]>(initial ?? min);
  const runWithCatch = useSetAtom(runWithCatchAtom);

  return (
    <>
      <div className="text-sm">{label}</div>

      <VectorSlider
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(newValue) => {
          setValue(newValue);
          void runWithCatch(() => onChange(newValue));
        }}
      />
    </>
  );
}

function ColorPickerRow({
  label,
  initial,
  onChange,
}: {
  label: string;
  initial: d.v3f;
  onChange: (value: d.v3f) => void;
}) {
  const [value, setValue] = useState<d.v3f>(initial);
  const runWithCatch = useSetAtom(runWithCatchAtom);

  return (
    <>
      <div className="text-sm">{label}</div>

      <ColorPicker
        value={value}
        onChange={(newValue) => {
          setValue(newValue);
          void runWithCatch(() => onChange(newValue));
        }}
      />
    </>
  );
}

function TextAreaRow({
  label,
  initial,
  onChange,
}: {
  label: string;
  initial: string;
  onChange: (value: string) => void;
}) {
  const [value, setValue] = useState(initial ?? '');
  const runWithCatch = useSetAtom(runWithCatchAtom);

  return (
    <>
      <div className="text-sm">{label}</div>

      <TextArea
        value={value}
        onChange={(newValue) => {
          setValue(newValue);
          void runWithCatch(() => onChange(newValue));
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
  const [value, setValue] = useState(initial ?? options[0]);
  const runWithCatch = useSetAtom(runWithCatchAtom);

  return (
    <>
      <div className="text-sm">{label}</div>

      <Select
        value={value}
        options={options}
        onChange={(newValue) => {
          setValue(newValue);
          void runWithCatch(() => onChange(newValue));
        }}
      />
    </>
  );
}

function ButtonRow({ label, onClick }: { label: string; onClick: () => void }) {
  const runWithCatch = useSetAtom(runWithCatchAtom);

  return (
    <div className="col-span-2 grid h-10">
      <Button onClick={() => runWithCatch(onClick)}>{label}</Button>
    </div>
  );
}

function paramToControlRow(param: ExampleControlParam) {
  return 'onSelectChange' in param ? (
    <SelectRow
      label={param.label}
      key={param.label}
      options={param.options}
      initial={param.initial}
      onChange={param.onSelectChange}
    />
  ) : 'onToggleChange' in param ? (
    <ToggleRow
      key={param.label}
      label={param.label}
      onChange={param.onToggleChange}
      initial={param.initial}
    />
  ) : 'onSliderChange' in param ? (
    <SliderRow
      key={param.label}
      label={param.label}
      onChange={param.onSliderChange}
      min={param.min}
      max={param.max}
      step={param.step}
      initial={param.initial}
    />
  ) : 'onVectorSliderChange' in param ? (
    <VectorSliderRow
      key={param.label}
      label={param.label}
      onChange={param.onVectorSliderChange}
      min={param.min}
      max={param.max}
      step={param.step}
      initial={param.initial}
    />
  ) : 'onColorChange' in param ? (
    <ColorPickerRow
      key={param.label}
      label={param.label}
      onChange={param.onColorChange}
      initial={param.initial}
    />
  ) : 'onButtonClick' in param ? (
    <ButtonRow key={param.label} label={param.label} onClick={param.onButtonClick} />
  ) : 'onTextChange' in param ? (
    <TextAreaRow
      key={param.label}
      label={param.label}
      onChange={param.onTextChange}
      initial={param.initial}
    />
  ) : (
    unreachable(param)
  );
}

const unreachable = (_: never) => null;

export function ControlPanel() {
  const [menuShowing, setMenuShowing] = useAtom(menuShownAtom);
  const [codeEditorShowing, setCodeEditorShowing] = useAtom(codeEditorShownAtom);
  const exampleControlParams = useAtomValue(exampleControlsAtom);

  const showLeftMenuId = useId();
  const showCodeEditorId = useId();

  return (
    <div
      className={cs(
        isGPUSupported ? '' : 'hidden md:flex',
        'box-border flex max-h-[50%] flex-col gap-4 overflow-auto rounded-xl bg-grayscale-0 p-6 md:max-h-full',
      )}
    >
      <FPSCounter />
      <div className="hidden flex-col gap-4 md:flex">
        <h2 className="font-medium text-xl">Control panel</h2>

        <label
          htmlFor={showLeftMenuId}
          className="flex cursor-pointer items-center justify-between gap-3 text-sm"
        >
          <span>Show left menu</span>
          <Toggle
            id={showLeftMenuId}
            checked={menuShowing}
            onChange={(e) => setMenuShowing(e.target.checked)}
          />
        </label>
        <label
          htmlFor={showCodeEditorId}
          className="flex cursor-pointer items-center justify-between gap-3 text-sm"
        >
          <span>Show code editor</span>
          <Toggle
            id={showCodeEditorId}
            checked={codeEditorShowing}
            onChange={(e) => setCodeEditorShowing(e.target.checked)}
          />
        </label>

        <hr className="my-0 box-border w-full border-tameplum-100 border-t" />
      </div>

      {isGPUSupported && (
        <>
          <h2 className="m-0 font-medium text-xl">Example controls</h2>
          <div className="grid grid-cols-2 items-center gap-4 overflow-auto p-1 pb-2">
            {exampleControlParams.map(paramToControlRow)}
          </div>
        </>
      )}
    </div>
  );
}
