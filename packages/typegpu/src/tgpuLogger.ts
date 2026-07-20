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
] as const;
type WarningType = (typeof warningTypes)[number];

// internal-facing API
interface Logger {
  warn(type: (typeof warningTypes)[number], ...args: unknown[]): void;
}

// user-facing API
interface Warn {
  disable(type: WarningType): void;
  reset(): void;
}

export class TgpuLogger implements Logger, Warn {
  #enabledWarnings: Set<WarningType> = new Set(warningTypes);

  disable(type: WarningType) {
    this.#enabledWarnings.delete(type);
  }

  reset() {
    this.#enabledWarnings = new Set(warningTypes);
  }

  warn(type: WarningType, ...args: unknown[]) {
    if (this.#enabledWarnings.has(type)) {
      console.warn(`⚠️ [${type}}] `, ...args);
    }
  }
}

const tgpuLogger = new TgpuLogger();
export const logger: Logger = tgpuLogger;
export const warn: Warn = tgpuLogger;
