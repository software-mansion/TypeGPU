import { DEV, TEST } from './shared/env.ts';

const warningTypes = [
  'deprecated',
  'suspicious',
  'fallback',

  'precision-loss',
  'implicit-conversion',

  'webgpu-feature-missing',
  'webgpu-limits-exceeded',
  'locations-mismatched',
  'log-limit-exceeded',
  'external-omitted',
  'uniform-schema-misaligned',
] as const;
type WarningType = (typeof warningTypes)[number];

// internal API
interface Logger {
  warn(type: WarningType, ...args: unknown[]): void;
}

/**
 * Use this object to globally disable TypeGPU warnings.
 * All warnings are better addressed than silenced, only use this when absolutely necessary.
 *
 * By default, lesser warnings are already silenced in production environment.
 */
interface Warn {
  /**
   * Globally disables one kind of warnings.
   * Do not use unless absolutely necessary.
   */
  disable(type: WarningType): void;
  /**
   * Restores the initial state.
   */
  reset(): void;
}

export class TgpuLogger implements Logger, Warn {
  #initialEnabledWarnings: readonly WarningType[];
  #enabledWarnings: Set<WarningType>;

  constructor(prod: boolean) {
    if (prod) {
      this.#initialEnabledWarnings = [
        'webgpu-feature-missing',
        'webgpu-limits-exceeded',
        'locations-mismatched',
        'log-limit-exceeded',
        'external-omitted',
      ];
    } else {
      this.#initialEnabledWarnings = warningTypes;
    }
    this.#enabledWarnings = new Set(this.#initialEnabledWarnings);
  }

  disable(type: WarningType) {
    this.#enabledWarnings.delete(type);
  }

  reset() {
    this.#enabledWarnings = new Set(this.#initialEnabledWarnings);
  }

  warn(type: WarningType, ...args: unknown[]) {
    if (this.#enabledWarnings.has(type)) {
      console.warn(`⚠️ [${type}] `, ...args);
    }
  }
}

const tgpuLogger = new TgpuLogger(!(DEV || TEST));
export const logger: Logger = tgpuLogger;
export const warn: Warn = tgpuLogger;
