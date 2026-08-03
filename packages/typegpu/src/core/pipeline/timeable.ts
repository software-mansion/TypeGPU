import { isQuerySet, type TgpuQuerySet } from '../querySet/querySet.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import { $internal } from '../../shared/symbols.ts';
import { logger } from '../../tgpuLogger.ts';
import type { TgpuCommandEncoder } from '../commandEncoder/commandEncoder.ts';

export interface Timeable {
  /**
   * Attaches a callback reporting the GPU-side start and end timestamps of the pipeline's pass.
   * Repeated executions within one command encoder write to the same query set indices,
   * so the callback fires once, with the timestamps of the last execution.
   */
  withPerformanceCallback(callback: (start: bigint, end: bigint) => void | Promise<void>): this;

  withTimestampWrites(options: {
    querySet: TgpuQuerySet<'timestamp'> | GPUQuerySet;
    beginningOfPassWriteIndex?: number;
    endOfPassWriteIndex?: number;
  }): this;
}

export type TimestampWritesPriors = {
  readonly timestampWrites?: {
    querySet: TgpuQuerySet<'timestamp'> | GPUQuerySet;
    beginningOfPassWriteIndex?: number;
    endOfPassWriteIndex?: number;
  };
  readonly performanceCallback?: (start: bigint, end: bigint) => void | Promise<void>;
};

export function createWithPerformanceCallback<T extends TimestampWritesPriors>(
  currentPriors: T,
  callback: (start: bigint, end: bigint) => void | Promise<void>,
  querySet: TgpuQuerySet<'timestamp'>,
): T {
  if (!currentPriors.timestampWrites) {
    return {
      ...currentPriors,
      performanceCallback: callback,
      timestampWrites: {
        querySet,
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
      },
    };
  }

  return {
    ...currentPriors,
    performanceCallback: callback,
  };
}

export function createWithTimestampWrites<T extends TimestampWritesPriors>(
  currentPriors: T,
  options: {
    querySet: TgpuQuerySet<'timestamp'> | GPUQuerySet;
    beginningOfPassWriteIndex?: number;
    endOfPassWriteIndex?: number;
  },
  root: ExperimentalTgpuRoot,
): T {
  if (!root.enabledFeatures.has('timestamp-query')) {
    throw new Error(
      'Timestamp writes require the "timestamp-query" feature to be enabled on GPU device.',
    );
  }

  const timestampWrites: TimestampWritesPriors['timestampWrites'] = {
    querySet: options.querySet,
  };

  if (options.beginningOfPassWriteIndex !== undefined) {
    timestampWrites.beginningOfPassWriteIndex = options.beginningOfPassWriteIndex;
  }
  if (options.endOfPassWriteIndex !== undefined) {
    timestampWrites.endOfPassWriteIndex = options.endOfPassWriteIndex;
  }

  return {
    ...currentPriors,
    timestampWrites,
  };
}

type TimestampRegistration = {
  priors: TimestampWritesPriors;
  callback: (start: bigint, end: bigint) => void | Promise<void>;
};

const pendingTimestampReads = new WeakMap<
  TgpuCommandEncoder,
  Map<TgpuQuerySet<'timestamp'>, TimestampRegistration[]>
>();

async function readTimestamps(
  root: ExperimentalTgpuRoot,
  querySet: TgpuQuerySet<'timestamp'>,
  registrations: TimestampRegistration[],
): Promise<void> {
  await root.device.queue.onSubmittedWorkDone();

  if (!querySet.available) {
    return;
  }

  const result = await querySet.read();

  for (const { priors, callback } of registrations) {
    const start = result[priors.timestampWrites?.beginningOfPassWriteIndex ?? 0];
    const end = result[priors.timestampWrites?.endOfPassWriteIndex ?? 1];

    if (start === undefined || end === undefined) {
      throw new Error('QuerySet did not return valid timestamps.');
    }

    await callback(start, end);
  }
}

/** Returns false when the encoder is one we cannot defer work to, meaning the callback never fires */
export function queueTimestampResolve(
  encoder: TgpuCommandEncoder,
  priors: TimestampWritesPriors,
): boolean {
  const querySet = priors.timestampWrites?.querySet;
  const callback = priors.performanceCallback as (
    start: bigint,
    end: bigint,
  ) => void | Promise<void>;

  if (!querySet) {
    throw new Error('Cannot dispatch workgroups with performance callback without a query set.');
  }

  if (!isQuerySet(querySet)) {
    throw new Error(
      'Performance callback with raw GPUQuerySet is not supported. Use TgpuQuerySet instead.',
    );
  }

  const internals = encoder[$internal];
  if (internals.adopted) {
    return false;
  }

  const { root } = internals;

  // recorded at submission time to capture the last pass written into this encoder
  internals.beforeFinish.set(querySet, (rawEncoder) => {
    rawEncoder.resolveQuerySet(
      root.unwrap(querySet),
      0,
      querySet.count,
      querySet[$internal].resolveBuffer,
      0,
    );
  });

  let byQuerySet = pendingTimestampReads.get(encoder);
  if (!byQuerySet) {
    byQuerySet = new Map();
    pendingTimestampReads.set(encoder, byQuerySet);
  }

  let registrations = byQuerySet.get(querySet);
  if (!registrations) {
    const regs: TimestampRegistration[] = [];
    registrations = regs;
    byQuerySet.set(querySet, regs);
    internals.afterSubmit.set(querySet, () => {
      byQuerySet.delete(querySet);
      void readTimestamps(root, querySet, regs);
    });
  }

  if (registrations.some((reg) => reg.priors === priors)) {
    logger.warnOnce(
      'suspicious',
      querySet,
      'repeated-timed-execution',
      'Repeated executions of a timed pipeline within one command encoder write to the same query set indices, so the performance callback reports only the last execution.',
    );
  } else {
    registrations.push({ priors, callback });
  }

  return true;
}
