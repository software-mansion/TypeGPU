import { d } from 'typegpu';
import {
  flattenControls,
  initializeControlParam,
  isFlatSection,
  type FlatLabeledControl,
} from '../../examples/common/flattenControls.ts';

const body = document.querySelector('body') as HTMLBodyElement;
body.style.display = 'flex';
body.style.flexDirection = 'column';
body.style.alignItems = 'center';
body.style.height = '100vh';
body.style.gap = '1.5rem';
body.style.margin = '0';
body.style.boxSizing = 'border-box';
body.style.padding = '1rem';
body.style.overflow = 'hidden';

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
  container.style.flex = '1 1 0';
  container.style.minHeight = '0';
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
controlsPanel.style.width = '100%';
controlsPanel.style.maxHeight = '40vh';
controlsPanel.style.overflowY = 'auto';
controlsPanel.style.flex = '0 0 auto';
if (body.firstChild) {
  body.insertBefore(controlsPanel, body.firstChild);
} else {
  body.appendChild(controlsPanel);
}

// Execute example
// @ts-expect-error
const example = await import('./src/index');

function appendSectionHeader(label: string) {
  const sectionHeader = document.createElement('div');
  sectionHeader.innerText = label;
  sectionHeader.style.gridColumn = 'span 2';
  sectionHeader.style.fontWeight = 'bold';
  sectionHeader.style.marginTop = '1rem';
  sectionHeader.style.borderBottom = '1px solid #ccc';
  controlsPanel.appendChild(sectionHeader);
}

function addControlToPanel(param: FlatLabeledControl) {
  const { label } = param;

  if ('onButtonClick' in param) {
    const button = document.createElement('button');
    button.innerText = label;
    button.style.gridColumn = 'span 2';
    button.addEventListener('click', () => (param.onButtonClick as () => void)());
    controlsPanel.appendChild(button);
    return;
  }

  const controlRow = document.createElement('div');
  controlRow.style.display = 'contents';
  const labelDiv = document.createElement('div');
  labelDiv.innerText = label;
  controlRow.appendChild(labelDiv);

  if ('onSliderChange' in param) {
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = `${param.min}`;
    slider.max = `${param.max}`;
    slider.step = `${(param.step as number | undefined) ?? 0.1}`;
    slider.value = `${param.initial}`;
    slider.addEventListener('input', () => {
      (param.onSliderChange as (v: number) => void)(Number.parseFloat(slider.value));
    });
    controlRow.appendChild(slider);
  }

  if ('onSelectChange' in param) {
    const select = document.createElement('select');
    select.innerHTML = (param.options as string[])
      .map((option) => `<option value="${option}">${option}</option>`)
      .join('');
    select.value = param.initial as string;
    select.addEventListener('change', () => {
      (param.onSelectChange as (v: string) => void)(select.value);
    });
    controlRow.appendChild(select);
  }

  if ('onVectorSliderChange' in param) {
    const sliderContainer = document.createElement('div');
    sliderContainer.style.display = 'flex';
    sliderContainer.style.flexDirection = 'column';
    sliderContainer.style.gap = '0.2rem';

    const currentValues = param.initial as d.v2f | d.v3f | d.v4f;
    const min = param.min as d.v2f | d.v3f | d.v4f;
    const max = param.max as d.v2f | d.v3f | d.v4f;
    const step = param.step as d.v2f | d.v3f | d.v4f;
    const length = min.length;
    const labels = ['x', 'y', 'z', 'w'];

    for (let i = 0; i < length; i++) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '0.2rem';

      const labelSpan = document.createElement('span');
      labelSpan.innerText = labels[i];

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = `${min[i]}`;
      slider.max = `${max[i]}`;
      slider.step = `${step[i] ?? 0.1}`;
      slider.value = `${currentValues[i]}`;

      slider.addEventListener('input', () => {
        currentValues[i] = Number.parseFloat(slider.value);
        (param.onVectorSliderChange as (value: d.v2f | d.v3f | d.v4f) => void)(currentValues);
      });

      row.appendChild(labelSpan);
      row.appendChild(slider);
      sliderContainer.appendChild(row);
    }

    controlRow.appendChild(sliderContainer);
  }

  if ('onColorChange' in param) {
    const input = document.createElement('input');
    input.type = 'color';
    const initial = (param.initial as d.v3f | undefined) ?? d.vec3f(0, 0, 0);
    input.value = rgbToHex(initial);
    input.addEventListener('input', () => {
      (param.onColorChange as (v: d.v3f) => void)(hexToRgb(input.value));
    });
    controlRow.appendChild(input);
  }

  if ('onToggleChange' in param) {
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = (param.initial as boolean | undefined) ?? false;
    toggle.addEventListener('change', () => {
      (param.onToggleChange as (v: boolean) => void)(toggle.checked);
    });
    controlRow.appendChild(toggle);
  }

  if ('onTextChange' in param) {
    const input = document.createElement('input');
    input.value = (param.initial as string | undefined) ?? '';
    input.addEventListener('input', () => {
      (param.onTextChange as (v: string) => void)(input.value);
    });
    controlRow.appendChild(input);
  }

  controlsPanel.appendChild(controlRow);
}

// Create example controls
for (const controls of Object.values(example)) {
  if (typeof controls === 'function') {
    continue;
  }

  for (const param of flattenControls(controls as Record<string, unknown>)) {
    if (isFlatSection(param)) {
      appendSectionHeader(param.label);
      continue;
    }
    addControlToPanel(param);
    initializeControlParam(param);
  }
}

function hexToRgb(hex: string): d.v3f {
  return d.vec3f(
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  );
}

function componentToHex(c: number) {
  const hex = (c * 255).toString(16);
  return hex.length === 1 ? `0${hex}` : hex;
}

function rgbToHex(rgb: d.v3f) {
  return `#${rgb.map(componentToHex).join('')}`;
}
