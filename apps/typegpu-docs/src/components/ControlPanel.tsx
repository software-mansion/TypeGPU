import StackBlitzSDK from '@stackblitz/sdk';
import cs from 'classnames';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useState } from 'react';
import { codeEditorShownAtom } from '../utils/examples/codeEditorShownAtom';
import { currentExampleAtom } from '../utils/examples/currentExampleAtom';
import { examples } from '../utils/examples/exampleContent';
import {
  type ExampleControlParam,
  exampleControlsAtom,
} from '../utils/examples/exampleControlAtom';
import { menuShownAtom } from '../utils/examples/menuShownAtom';
import { sandboxShownAtom } from '../utils/examples/sandboxShownAtom';
import type { Example } from '../utils/examples/types';
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
  const currentExample = useAtomValue(currentExampleAtom);
  const exampleControlParams = useAtomValue(exampleControlsAtom);
  const setSandboxShow = useSetAtom(sandboxShownAtom);

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

        {currentExample && currentExample in examples ? (
          <Button
            onClick={() => {
              setSandboxShow(true);
              setMenuShowing(true);
              openInStackBlitz(examples[currentExample]);
            }}
          >
            Edit in Sandbox
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

function openInStackBlitz(example: Example) {
  StackBlitzSDK.embedProject(
    'sandbox',
    // Payload
    {
      template: 'node',
      title: example.metadata.title,
      files: {
        'index.html': `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + TS</title>
  </head>
  <body>
    ${example.htmlCode}

    <script type="module" src="/index.ts"></script>
  </body>
</html>        
        `,
        'index.ts': `
import * as example from './src/example.ts';
console.log(example);
`,
        'src/example.ts': example.tsCode,
        'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "typeRoots": ["./node_modules/@webgpu/types", "./node_modules/@types"],

    /* Bundler mode */
    "moduleResolution": "node",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}`,
        'package.json': `{
  "name": "typegpu-example-sandbox",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "devDependencies": {
    "typescript": "^5.5.3",
    "vite": "^5.4.2"
  },
  "dependencies": {
    "@webgpu/types": "^0.1.44",
    "typegpu": "^0.2.0"
  }
}`,
      },
    },

    // Options
    {
      openFile: 'src/example.ts',
      height: '100%',
      theme: 'light',
    },
  );
}
