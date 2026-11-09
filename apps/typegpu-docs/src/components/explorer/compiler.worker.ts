import { compile } from './compile.ts';
import type { Target, TraceResult } from './trace.ts';

export type CompileResponse =
  | { result: TraceResult; error?: never }
  | { error: string; result?: never };
self.onmessage = (event: MessageEvent<{ source: string; target: Target }>) => {
  try {
    self.postMessage(
      { result: compile(event.data.source, event.data.target) } satisfies CompileResponse,
      [],
    );
  } catch (error) {
    self.postMessage(
      { error: error instanceof Error ? error.message : String(error) } satisfies CompileResponse,
      [],
    );
  }
};
