import type { AnyVecInstance, v4f } from '../../data/wgslTypes.ts';

export type AnyAutoCustoms = Record<string, number | AnyVecInstance>;

export type AutoVertexIn<T extends AnyAutoCustoms> =
  & T
  & {
    // builtins
    $vertexIndex: number;
    $instanceIndex: number;
  };

export type AutoVertexOut<T extends AnyAutoCustoms> =
  & T
  & {
    // builtins
    $clipDistances?: number[] | undefined;
    $position?: v4f | undefined;
  };

export type AutoFragmentIn<T extends AnyAutoCustoms> =
  & T
  & {
    // builtins
    $position: v4f;
    $frontFacing: boolean;
    $primitiveIndex: number;
    $sampleIndex: number;
    $sampleMask: number;
    $subgroupInvocationId: number;
    $subgroupSize: number;
  };

export type AutoFragmentOut<T extends undefined | v4f | AnyAutoCustoms> =
  T extends undefined | v4f ? T
    : {
      // builtins
      $fragDepth?: number | undefined;
      $sampleMask?: number | undefined;
    };
