import type { ResolutionResult } from '../../resolutionCtx.ts';
import { PERF } from '../../shared/meta.ts';

export interface PerformanceTracker {
  measureResolve(callback: () => ResolutionResult): ResolutionResult;
  measureCompile(device: GPUDevice): void;
}

export class PerformanceTrackerImpl implements PerformanceTracker {
  #resolveMeasure: PerformanceMeasure | undefined;
  #wgslSize: number | undefined;

  measureResolve(callback: () => ResolutionResult): ResolutionResult {
    const resolveStart = performance.mark('typegpu:resolution:start');
    const result = callback();
    this.#resolveMeasure = performance.measure('typegpu:resolution', {
      start: resolveStart.name,
    });
    this.#wgslSize = result.code.length;
    return result;
  }

  measureCompile(device: GPUDevice): void {
    void (async () => {
      const start = performance.mark('typegpu:compile-start');
      await device.queue.onSubmittedWorkDone();
      const compileMeasure = performance.measure('typegpu:compiled', {
        start: start.name,
      });

      PERF?.record('resolution', {
        resolveDuration: this.#resolveMeasure?.duration,
        compileDuration: compileMeasure.duration,
        wgslSize: this.#wgslSize,
      });
    })();
  }
}

export class NullPerformanceTracker implements PerformanceTracker {
  measureResolve(callback: () => ResolutionResult): ResolutionResult {
    return callback();
  }

  measureCompile(): void {}
}
