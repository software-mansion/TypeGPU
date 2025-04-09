import cs from 'classnames';
import { useAtom, useAtomValue } from 'jotai';
import { useSetAtom } from 'jotai';
import { useId, useState } from 'react';
import { codeEditorShownAtom } from '../utils/examples/codeEditorShownAtom.ts';
import { currentExampleAtom } from '../utils/examples/currentExampleAtom.ts';
import { runWithCatchAtom } from '../utils/examples/currentSnackbarAtom.ts';
import { examples } from '../utils/examples/exampleContent.ts';
import {
  type ExampleControlParam,
  exampleControlsAtom,
} from '../utils/examples/exampleControlAtom.ts';
import { menuShownAtom } from '../utils/examples/menuShownAtom.ts';
import { isGPUSupported } from '../utils/isGPUSupported.ts';
import { Button } from './design/Button.tsx';
import { Select } from './design/Select.tsx';
import { Slider } from './design/Slider.tsx';
import { TextArea } from './design/TextArea.tsx';
import { Toggle } from './design/Toggle.tsx';
import { openInStackBlitz } from './stackblitz/openInStackBlitz.ts';

function ToggleRow({
  label,
  initial = false,
  onChange,
}: {
  label: string;
  initial?: boolean;
  onChange: (value: boolean) => void;
}) {
  const [value, setValue] = useState(initial);
  const runWithCatch = useSetAtom(runWithCatchAtom);

  const toggleId = useId();

  return (
    <>
      <div className="text-sm">{label}</div>

      <label
        htmlFor={toggleId}
        className="grid items-center justify-end h-10 cursor-pointer"
      >
        <Toggle
          id={toggleId}
          checked={value}
          onChange={(e) => {
            setValue(e.target.checked);
            runWithCatch(() => onChange(e.target.checked));
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
  initial?: number;
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
          runWithCatch(() => onChange(newValue));
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
  initial?: string;
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
          runWithCatch(() => onChange(newValue));
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
  initial?: string;
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
          runWithCatch(() => onChange(newValue));
        }}
      />
    </>
  );
}

function ButtonRow({ label, onClick }: { label: string; onClick: () => void }) {
  const runWithCatch = useSetAtom(runWithCatchAtom);

  return (
    <div className="grid h-10 col-span-2">
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
  ) : 'onButtonClick' in param ? (
    <ButtonRow
      key={param.label}
      label={param.label}
      onClick={param.onButtonClick}
    />
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
  const [codeEditorShowing, setCodeEditorShowing] =
    useAtom(codeEditorShownAtom);
  const currentExample = useAtomValue(currentExampleAtom);
  const exampleControlParams = useAtomValue(exampleControlsAtom);

  const showLeftMenuId = useId();
  const showCodeEditorId = useId();

  return (
    <div
      className={cs(
        isGPUSupported ? '' : 'hidden md:flex',
        'box-border flex flex-col gap-4 p-6 bg-grayscale-0 rounded-xl max-h-[50%] md:max-h-full overflow-auto',
      )}
    >
      <div className="hidden md:flex flex-col gap-4">
        <h2 className="text-xl font-medium">Control panel</h2>
        <label
          htmlFor={showLeftMenuId}
          className="flex items-center justify-between gap-3 text-sm cursor-pointer"
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
          className="flex items-center justify-between gap-3 text-sm cursor-pointer"
        >
          <span>Show code editor</span>
          <Toggle
            id={showCodeEditorId}
            checked={codeEditorShowing}
            onChange={(e) => setCodeEditorShowing(e.target.checked)}
          />
        </label>

        {currentExample && currentExample in examples ? (
          <Button onClick={() => openInStackBlitz(examples[currentExample])}>
            Edit on StackBlitz
          </Button>
        ) : null}

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
