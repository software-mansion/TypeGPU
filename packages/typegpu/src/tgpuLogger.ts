const warningTypes = [
  'deprecated',
  'suspicious',
  'fallback',

  'missing-webgpu-feature',
  'webgpu-limits-exceeded',

  'implicit-conversion',
  'mismatched-locations',
  'log-limit-exceeded',
  'omitted-external',
  'precision-loss',
] as const;
type WarningType = (typeof warningTypes)[number];

// internal-facing API
interface Logger {
  warn(type: (typeof warningTypes)[number], ...args: unknown[]): void;
}

// user-facing API
interface Warn {
  disable(type: WarningType): void;
  enable(type: WarningType): void;
}

class TgpuLogger implements Logger, Warn {
  #enabledWarnings: Set<WarningType> = new Set(warningTypes);

  disable(type: WarningType) {
    this.#enabledWarnings.delete(type);
  }

  enable(type: WarningType) {
    this.#enabledWarnings.add(type);
  }

  warn(type: WarningType, ...args: unknown[]) {
    if (this.#enabledWarnings.has(type)) {
      console.warn(...args);
      // console.warn(`⚠️ [${type}}] `, ...args);
    }
  }
}

const tgpuLogger = new TgpuLogger();
export const logger: Logger = tgpuLogger;
export const warn: Warn = tgpuLogger;
