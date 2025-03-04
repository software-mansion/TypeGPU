// @ts-ignore
import * as example from './src/index.ts';

const body = document.querySelector('body') as HTMLBodyElement;
body.style.display = 'flex';
body.style.flexDirection = 'column';
body.style.alignItems = 'center';
body.style.height = '75vh';
body.style.gap = '1.5rem';

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

  const aspectRatio = canvas.dataset.aspectRatio ?? '1';

  container.style.display = 'flex';
  container.style.flex = '1';
  container.style.justifyContent = 'center';
  container.style.alignItems = 'center';
  container.style.width = '100%';

  container.style.containerType = 'size';

  frame.style.position = 'relative';
  frame.style.aspectRatio = aspectRatio;
  frame.style.height = `min(calc(min(100cqw, 100cqh)/(${aspectRatio})), min(100cqw, 100cqh))`;

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

      if ('onSelectChange' in params) {
        const select = document.createElement('select');
        select.innerHTML = params.options
          .map((option) => `<option value="${option}">${option}</option>`)
          .join('');
        select.value = params.initial ?? params.options[0];

        select.addEventListener('change', () => {
          params.onSelectChange(select.value);
        });

        controlRow.appendChild(select);
        params.onSelectChange(select.value);
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

type ButtonControlParam = {
  onButtonClick: (() => void) | (() => Promise<void>);
};

type ExampleControlParam =
  | SelectControlParam
  | ToggleControlParam
  | SliderControlParam
  | ButtonControlParam;
