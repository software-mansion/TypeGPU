import type * as d from 'typegpu/data';

const body = document.querySelector('body') as HTMLBodyElement;
body.style.display = 'flex';
body.style.flexDirection = 'column';
body.style.alignItems = 'center';
body.style.height = '100vh';
body.style.gap = '1.5rem';
body.style.margin = '0';
body.style.boxSizing = 'border-box';
body.style.padding = '1rem';

// Resize canvases
for (const canvas of document.querySelectorAll('canvas')) {
  if ('width' in canvas.attributes || 'height' in canvas.attributes) {
    continue; // custom canvas, not replacing with resizable
  }

  const container = document.createElement('div');
  const frame = document.createElement('div');

  canvas.parentElement?.replaceChild(container, canvas);

  frame.appendChild(canvas);
  container.appendChild(frame);

  container.style.display = 'flex';
  container.style.flex = '1';
  container.style.justifyContent = 'center';
  container.style.alignItems = 'top';
  container.style.width = '100%';

  container.style.containerType = 'size';

  frame.style.position = 'relative';

  if (canvas.dataset.fitToContainer !== undefined) {
    frame.style.width = '100%';
    frame.style.height = '100%';
  } else {
    const aspectRatio = canvas.dataset.aspectRatio ?? '1';
    frame.style.aspectRatio = aspectRatio;
    frame.style.height = `min(calc(min(100cqw, 100cqh)/(${aspectRatio})), min(100cqw, 100cqh))`;
  }

  canvas.style.position = 'absolute';
  canvas.style.width = '100%';
  canvas.style.height = '100%';

  const onResize = () => {
    canvas.width = frame.clientWidth * window.devicePixelRatio;
    canvas.height = frame.clientHeight * window.devicePixelRatio;
  };

  onResize();
  new ResizeObserver(onResize).observe(container);
}

const controlsPanel = document.createElement('div');
controlsPanel.style.display = 'grid';
controlsPanel.style.gridTemplateColumns = '1fr 1fr';
controlsPanel.style.gap = '1rem';
if (body.firstChild) {
  body.insertBefore(controlsPanel, body.firstChild);
} else {
  body.appendChild(controlsPanel);
}

// Execute example
// @ts-ignore
const example = import('./src/index.ts');

// Create example controls
for (const controls of Object.values(example)) {
  if (typeof controls === 'function') {
    continue;
  }

  for (const [label, params] of Object.entries(
    controls as Record<string, ExampleControlParam>,
  )) {
    if ('onButtonClick' in params) {
      const button = document.createElement('button');
      button.innerText = label;
      button.style.gridColumn = 'span 2';
      button.addEventListener('click', () => params.onButtonClick());
      controlsPanel.appendChild(button);
    } else {
      const controlRow = document.createElement('div');
      controlRow.style.display = 'contents';
      const labelDiv = document.createElement('div');
      labelDiv.innerText = label;
      controlRow.appendChild(labelDiv);

      if ('onSliderChange' in params) {
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = `${params.min}`;
        slider.max = `${params.max}`;
        slider.step = `${params.step ?? 0.1}`;
        slider.value = `${params.initial}`;
        slider.addEventListener('input', () => {
          params.onSliderChange(Number.parseFloat(slider.value));
        });

        controlRow.appendChild(slider);
        params.onSliderChange(Number.parseFloat(slider.value));
      }

      if ('onVectorSliderChange' in params) {
        const vectorContainer = document.createElement('div');
        vectorContainer.style.display = 'flex';
        vectorContainer.style.flexDirection = 'column';
        vectorContainer.style.gap = '0.5rem';

        const components: Array<'x' | 'y' | 'z' | 'w'> = [];
        const minObj = params.min as unknown as Record<string, number>;
        if ('x' in minObj) components.push('x');
        if ('y' in minObj) components.push('y');
        if ('z' in minObj) components.push('z');
        if ('w' in minObj) components.push('w');

        const getComponentValue = (
          vec: Record<string, number>,
          comp: 'x' | 'y' | 'z' | 'w',
        ): number => (vec[comp] !== undefined ? vec[comp] : 0);

        for (const comp of components) {
          const row = document.createElement('div');
          row.style.display = 'flex';
          row.style.alignItems = 'center';
          row.style.gap = '0.5rem';

          const labelSpan = document.createElement('span');
          labelSpan.innerText = comp;
          labelSpan.style.minWidth = '20px';

          const slider = document.createElement('input');
          slider.type = 'range';
          slider.min = `${getComponentValue(params.min as unknown as Record<string, number>, comp)}`;
          slider.max = `${getComponentValue(params.max as unknown as Record<string, number>, comp)}`;
          slider.step = `${getComponentValue(params.step as unknown as Record<string, number>, comp)}`;
          const initialVec =
            (params.initial as unknown as Record<string, number>) ||
            (params.min as unknown as Record<string, number>);
          slider.value = `${getComponentValue(initialVec, comp)}`;

          slider.addEventListener('input', () => {
            const currentVec =
              (params.initial as unknown as Record<string, number>) ||
              (params.min as unknown as Record<string, number>);
            const newVec = {
              ...currentVec,
              [comp]: Number.parseFloat(slider.value),
            };
            params.onVectorSliderChange(newVec as unknown as d.AnyVecInstance);
            params.initial = newVec as unknown as d.AnyVecInstance;
          });

          row.appendChild(labelSpan);
          row.appendChild(slider);
          vectorContainer.appendChild(row);
        }

        controlRow.appendChild(vectorContainer);
      }

      if ('onToggleChange' in params) {
        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.checked = params.initial ?? false;

        toggle.addEventListener('change', () => {
          params.onToggleChange(toggle.checked);
        });

        controlRow.appendChild(toggle);
        params.onToggleChange(toggle.checked);
      }

      if ('onTextChange' in params) {
        const input = document.createElement('input');
        input.value = params.initial ?? '';

        input.addEventListener('input', () => {
          params.onTextChange(input.value);
        });

        controlRow.appendChild(input);
        params.onTextChange(input.value);
      }

      controlsPanel.appendChild(controlRow);
    }
  }
}

type SelectControlParam = {
  onSelectChange: (newValue: string) => void;
  initial?: string;
  options: string[];
};

type ToggleControlParam = {
  onToggleChange: (newValue: boolean) => void;
  initial?: boolean;
};

type SliderControlParam = {
  onSliderChange: (newValue: number) => void;
  initial?: number;
  min?: number;
  max?: number;
  step?: number;
};

type VectorSliderControlParam<T extends d.AnyVecInstance> = {
  onVectorSliderChange: (newValue: T) => void;
  initial?: T;
  min: T;
  max: T;
  step: T;
};

type ButtonControlParam = {
  onButtonClick: (() => void) | (() => Promise<void>);
};

type TextAreaControlParam = {
  onTextChange: (newValue: string) => void;
  initial?: string;
};

type ExampleControlParam =
  | SelectControlParam
  | ToggleControlParam
  | SliderControlParam
  | ButtonControlParam
  | TextAreaControlParam
  | VectorSliderControlParam<d.AnyVecInstance>;
