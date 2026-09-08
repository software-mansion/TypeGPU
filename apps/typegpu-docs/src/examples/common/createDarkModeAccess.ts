import { d, tgpu, type TgpuRoot } from 'typegpu';

export interface DarkModeAccessOptions {
  onThemeChange?: (darkMode: boolean) => void;
}

function isDarkMode(): boolean {
  return document.documentElement.dataset.theme === 'dark';
}

export function createDarkModeAccess(root: TgpuRoot, options: DarkModeAccessOptions = {}) {
  let value = isDarkMode();
  const darkModeUniform = root.createUniform(d.u32, value ? 1 : 0);

  function isDarkModeGPU(): boolean {
    'use gpu';
    return darkModeUniform.$ === 1;
  }

  const darkModeAccess = tgpu.accessor(d.bool, isDarkModeGPU);

  const observer = new MutationObserver(() => {
    const nextValue = isDarkMode();
    if (nextValue === value) {
      return;
    }

    value = nextValue;
    darkModeUniform.write(value ? 1 : 0);
    options.onThemeChange?.(value);
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  return {
    get $() {
      return darkModeAccess.$;
    },
    get value() {
      return value;
    },
    detach() {
      observer.disconnect();
    },
  };
}
