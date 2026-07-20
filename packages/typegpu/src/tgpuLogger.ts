const warningTypes = [
  'implicit-conversion',
  'missing-webgpu-feature',
  'non-contiguous-memory',
  'webgpu-limits-exceeded',
  'mismatched-locations',
  'omitted-external',
  'deprecated-method-called',
  'suspicious-call',
  'eval-not-supported-in-env',
  'not-supported',
  'precision-loss',
  'log-limit-exceeded',
  'failed-to-compile-writer',
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
