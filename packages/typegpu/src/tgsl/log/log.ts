import { fn } from '../../core/function/tgpuFn.ts';
import type { TgpuRoot } from '../../core/root/rootTypes.ts';
import { arrayOf } from '../../data/array.ts';
import { atomic } from '../../data/atomic.ts';
import { u32 } from '../../data/numeric.ts';
import { sizeOf } from '../../data/sizeOf.ts';
import { snip, type Snippet } from '../../data/snippet.ts';
import { struct } from '../../data/struct.ts';
import { vec3u } from '../../data/vector.ts';
import { Void } from '../../data/wgslTypes.ts';
import { GenerationCtx } from '../generationHelpers.ts';
import { serializers } from './serializers.ts';
import { LogManager, LogManagerOptions, LogMetadata } from './types.ts';

const fallbackSnippet = snip('/* console.log() */', Void);

export class LogManagerDummyImpl implements LogManager {
  getMetadata(): undefined {
    return undefined;
  }
  registerLog(): Snippet {
    console.warn(
      "'console.log' is currently only supported in compute pipelines.",
    );
    return fallbackSnippet;
  }
}

export class LogManagerImpl implements LogManager {
  #metaData: LogMetadata;
  #nextLogId = 1;
  constructor(root: TgpuRoot, options: LogManagerOptions) {
    if (options?.oneLogSize === undefined) {
      options.oneLogSize = 3;
    }
    if (options?.maxLogCount === undefined) {
      options.maxLogCount = 256;
    }
    const sanitizedOptions = options as Required<LogManagerOptions>;

    const DataSchema = struct({
      id: u32,
      data: arrayOf(u32, sanitizedOptions.oneLogSize),
    }).$name('log data schema');

    const dataBuffer = root
      .createMutable(arrayOf(DataSchema, sanitizedOptions.maxLogCount))
      .$name('log buffer');

    const dataIndexBuffer = root.createMutable(atomic(u32));

    this.#metaData = {
      dataIndexBuffer,
      dataBuffer,
      options: sanitizedOptions,
      logIdToSchema: new Map(),
    };
  }

  getMetadata(): LogMetadata | undefined {
    return this.#nextLogId === 1 ? undefined : this.#metaData;
  }

  registerLog(ctx: GenerationCtx, args: Snippet[]): Snippet {
    if (args.length !== 1) {
      console.warn('Currently only logs of exactly 1 argument are supported.');
      return snip('/* console.log() */', Void);
    }
    if (args[0]?.dataType !== u32 && args[0]?.dataType !== vec3u) {
      console.warn(
        "Currently only values of type 'u32', 'vec3u' and strings can be logged.",
      );
      return snip('/* console.log() */', Void);
    }
    const id = this.#nextLogId++;

    const dataType = args[0].dataType;
    const serializer = serializers[dataType.type];
    this.#metaData.logIdToSchema.set(id, [dataType]);

    const log = fn([dataType])`(loggedValue) {
      var dataIndex = atomicAdd(&dataIndexBuffer, 1);
      var serializedData = serializer(loggedValue);
      dataBuffer[dataIndex].id = ${id};
      for (var i = 0u; i< ${sizeOf(dataType)}; i++) {
        dataBuffer[dataIndex].data[i] = serializedData[i];
      }
    }`.$uses({
      serializer,
      dataIndexBuffer: this.#metaData.dataIndexBuffer,
      dataBuffer: this.#metaData.dataBuffer,
    }).$name(`log ${id}`);

    return snip(`${ctx.resolve(log)}(${args[0].value})`, Void);
  }
}
