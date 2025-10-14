import { scope } from 'arktype';

const resolutionComlexityTypes = scope({
  exampleResult: {
    example: 'string',
    codeSizeBytes: 'number',
    resolutionTimeMs: 'number',
  },

  releaseResult: {
    release: 'string',
    examplesResults: 'exampleResult[]',
  },
}).export();

export type exampleResult = typeof resolutionComlexityTypes.exampleResult.t;
export type releaseResult = typeof resolutionComlexityTypes.releaseResult.t;
