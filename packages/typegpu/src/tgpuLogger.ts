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

class TgpuLogger {
  #enabledWarnings: Set<WarningType> = new Set(warningTypes);

  disableWarn(type: WarningType) {
    this.#enabledWarnings.delete(type);
  }

  enableWarn(type: WarningType) {
    this.#enabledWarnings.add(type);
  }

  warn(type: (typeof warningTypes)[number], ...args: unknown[]) {
    if (this.#enabledWarnings.has(type)) {
      console.warn(...args);
    }
  }
}

export const tgpuLogger = new TgpuLogger();
