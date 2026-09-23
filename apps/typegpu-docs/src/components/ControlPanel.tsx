import cs from 'classnames';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { runWithCatchAtom } from '../utils/examples/currentSnackbarAtom.ts';
import {
  type ExampleControlParam,
  exampleControlsAtom,
} from '../utils/examples/exampleControlAtom.ts';
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
      <div className="self-center text-sm">{label}</div>

      <label htmlFor={toggleId} className="grid h-7 cursor-pointer items-center justify-end">
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
      <div className="self-center text-sm">{label}</div>

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

function VectorSliderRow<T extends d.v2f | d.v3f | d.v4f>({
  label,
  initial,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  initial: T;
  min: T;
  max: T;
  step: T;
  onChange: (value: T) => void;
}) {
  const [value, setValue] = useState<T>(initial);
  const runWithCatch = useSetAtom(runWithCatchAtom);

  return (
    <>
      <div className="self-center text-sm">{label}</div>

      <VectorSlider
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(newValue) => {
          setValue(newValue as T);
          void runWithCatch(() => onChange(newValue as T));
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
      <div className="self-center text-sm">{label}</div>

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
      <div className="self-center text-sm">{label}</div>

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
      <div className="self-center text-sm">{label}</div>

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
    <div className="col-span-2 grid">
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
      onChange={param.onVectorSliderChange as (value: d.v2f | d.v3f | d.v4f) => void}
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

export function ControlPanel({
  fullscreen,
  onFullscreenToggle,
  onHide,
}: {
  fullscreen: boolean;
  onFullscreenToggle: () => void;
  onHide?: () => void;
}) {
  const exampleControlParams = useAtomValue(exampleControlsAtom);
  const controlsScrollRef = useRef<HTMLDivElement>(null);
  const [scrollFades, setScrollFades] = useState({ top: false, bottom: false });

  const updateScrollFades = useCallback(() => {
    const scrollSurface = controlsScrollRef.current;
    if (!scrollSurface) return;

    const top = scrollSurface.scrollTop > 1;
    const bottom =
      scrollSurface.scrollTop + scrollSurface.clientHeight < scrollSurface.scrollHeight - 1;

    setScrollFades((current) =>
      current.top === top && current.bottom === bottom ? current : { top, bottom },
    );
  }, []);

  useEffect(() => {
    const scrollSurface = controlsScrollRef.current;
    if (!scrollSurface) return;

    const resizeObserver = new ResizeObserver(updateScrollFades);
    resizeObserver.observe(scrollSurface);
    const animationFrame = requestAnimationFrame(updateScrollFades);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animationFrame);
    };
  }, [exampleControlParams, updateScrollFades]);

  return (
    <div
      className={cs(
        isGPUSupported ? '' : 'hidden @3xl/example-preview:flex',
        fullscreen ? 'max-h-[calc(100dvh-2rem)]' : 'max-h-[100cqw] @3xl/example-preview:max-h-none',
        'border-tameplum-100 bg-white dark:border-white/10 dark:bg-[#272b3c] box-border flex min-h-0 w-full flex-1 flex-col gap-2 border @3xl/example-preview:shrink-0',
      )}
    >
      {isGPUSupported && (
        <>
          <div className="flex items-center justify-between gap-3 px-4 pt-4">
            <h2 className="m-0 font-medium text-xl">Control panel</h2>
            {onHide && <Button onClick={onHide}>Hide</Button>}
          </div>
          <div className="relative grid min-h-0 flex-1">
            <div
              ref={controlsScrollRef}
              onScroll={updateScrollFades}
              className="grid min-h-0 grid-cols-[minmax(0,0.3fr)_minmax(0,0.7fr)] content-start items-start gap-3 overflow-auto px-4 pt-1 pb-2"
            >
              <div className="col-span-2 grid">
                <Button onClick={onFullscreenToggle}>
                  {fullscreen ? 'Exit fullscreen' : 'Open fullscreen'}
                </Button>
              </div>
              {exampleControlParams.map(paramToControlRow)}
            </div>
            <div
              className={cs(
                'pointer-events-none absolute inset-x-0 top-0 z-10 h-3 bg-gradient-to-b from-white to-transparent transition-opacity duration-150 motion-reduce:transition-none dark:from-[#272b3c]',
                scrollFades.top ? 'opacity-100' : 'opacity-0',
              )}
              aria-hidden="true"
            />
            <div
              className={cs(
                'pointer-events-none absolute inset-x-0 bottom-0 z-10 h-3 bg-gradient-to-t from-white to-transparent transition-opacity duration-150 motion-reduce:transition-none dark:from-[#272b3c]',
                scrollFades.bottom ? 'opacity-100' : 'opacity-0',
              )}
              aria-hidden="true"
            />
          </div>
        </>
      )}
      <div className="px-4 pb-4">
        <FPSCounter />
      </div>
    </div>
  );
}
