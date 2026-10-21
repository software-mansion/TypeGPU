import {
  MODEL_SIZES,
  type ModelSize,
  RECOMMENDED_MODEL,
  cachingEnabled,
  clearDownloads,
  isModelCached,
  modelLabel,
  modelVariant,
  setCachingEnabled,
} from './model-store.ts';

export const SourceChoice = {
  CAMERA: 'camera',
  DEMO: 'demo',
  UPLOAD: 'upload',
} as const;
export type SourceChoice = (typeof SourceChoice)[keyof typeof SourceChoice];

const SOURCE_LABELS: [SourceChoice, string][] = [
  [SourceChoice.CAMERA, 'live camera'],
  [SourceChoice.DEMO, 'demo photo'],
  [SourceChoice.UPLOAD, 'your photo…'],
];

const IS_GECKO = /\bGecko\/\d/.test(navigator.userAgent) && /\brv:\d/.test(navigator.userAgent);

export class SourceChooser {
  source: SourceChoice = SourceChoice.CAMERA;
  model: ModelSize = RECOMMENDED_MODEL;
  uploadedImage: ImageBitmap | undefined;

  readonly #panel = document.querySelector('.chooser') as HTMLDivElement;
  readonly #sourceRow = document.querySelector('.source-row') as HTMLDivElement;
  readonly #modelRow = document.querySelector('.model-row') as HTMLDivElement;
  readonly #error = document.querySelector('.chooser-error') as HTMLParagraphElement;
  readonly #cacheToggle = document.querySelector('.cache-toggle input') as HTMLInputElement;
  readonly #clearCacheButton = document.querySelector('.clear-cache') as HTMLButtonElement;
  readonly #photoInput = document.querySelector('.photo-input') as HTMLInputElement;
  readonly #hasShaderF16: boolean;
  readonly #signal: AbortSignal;

  constructor(hasShaderF16: boolean, onStart: () => void, signal: AbortSignal) {
    this.#hasShaderF16 = hasShaderF16 && !IS_GECKO;
    this.#signal = signal;
    this.#buildSourceRow();
    this.#buildModelRow();
    const startButton = document.querySelector('.start-button') as HTMLButtonElement;
    startButton.addEventListener('click', onStart, { signal });
    this.#cacheToggle.checked = cachingEnabled();
    this.#cacheToggle.addEventListener(
      'change',
      () => setCachingEnabled(this.#cacheToggle.checked),
      {
        signal,
      },
    );
    this.#clearCacheButton.addEventListener('click', () => void this.#clearDownloads(), { signal });
  }

  variant(size: ModelSize) {
    return modelVariant(size, this.#hasShaderF16);
  }

  show(errorText?: string): void {
    this.#error.textContent = errorText ?? '';
    this.#error.hidden = !errorText;
    this.#markSelected();
    this.#panel.hidden = false;
    void this.#refreshCachedBadges();
  }

  hide(): void {
    this.#panel.hidden = true;
  }

  destroy(): void {
    this.uploadedImage?.close();
  }

  #buildSourceRow(): void {
    for (const [choice, label] of SOURCE_LABELS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.dataset.choice = choice;
      button.addEventListener('click', () => this.#selectSource(choice), { signal: this.#signal });
      this.#sourceRow.append(button);
    }
    this.#photoInput.addEventListener('change', () => this.#takeUpload(), { signal: this.#signal });
  }

  #buildModelRow(): void {
    for (const size of MODEL_SIZES) {
      const variant = this.variant(size);
      if (!variant) {
        continue;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = modelLabel(size, variant);
      button.dataset.model = size;
      if (size === RECOMMENDED_MODEL) {
        button.classList.add('recommended');
      }
      const badge = document.createElement('span');
      badge.className = 'cached-badge';
      badge.textContent = 'cached';
      badge.hidden = true;
      button.append(badge);
      button.addEventListener('click', () => this.#selectModel(size), { signal: this.#signal });
      this.#modelRow.append(button);
    }
  }

  #selectSource(choice: SourceChoice): void {
    if (choice === SourceChoice.UPLOAD) {
      this.#photoInput.click();
      return;
    }
    this.source = choice;
    this.#markSelected();
  }

  #selectModel(size: ModelSize): void {
    this.model = size;
    this.#markSelected();
  }

  #takeUpload(): void {
    const file = this.#photoInput.files?.[0];
    if (!file) {
      return;
    }
    void createImageBitmap(file).then((bitmap) => {
      this.uploadedImage?.close();
      this.uploadedImage = bitmap;
      this.source = SourceChoice.UPLOAD;
      this.#markSelected();
    });
  }

  #markSelected(): void {
    for (const button of this.#sourceRow.querySelectorAll('button')) {
      button.classList.toggle('selected', button.dataset.choice === this.source);
    }
    for (const button of this.#modelRow.querySelectorAll('button')) {
      button.classList.toggle('selected', button.dataset.model === this.model);
    }
  }

  async #refreshCachedBadges(): Promise<void> {
    let anyCached = false;
    for (const button of this.#modelRow.querySelectorAll('button')) {
      const variant = this.variant(button.dataset.model as ModelSize);
      const cached = variant !== undefined && (await isModelCached(variant));
      anyCached = anyCached || cached;
      const badge = button.querySelector('.cached-badge');
      if (badge instanceof HTMLElement) {
        badge.hidden = !cached;
      }
    }
    this.#clearCacheButton.disabled = !anyCached;
  }

  async #clearDownloads(): Promise<void> {
    await clearDownloads();
    await this.#refreshCachedBadges();
  }
}
