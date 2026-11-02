import { d } from 'typegpu';
import {
  splitWorkgroups,
  vec4Base,
  dispatchTensor,
  plainHwc4Shape,
  sectionBinding,
  type DispatchContext,
  type PlainHwc4Shape,
} from './dispatch-helpers.ts';
import type { Vec4Activation } from './kernels/helpers.ts';
import { activationSlot } from './kernels/helpers.ts';
import {
  WinogradUniforms,
  winogradGemmLayout,
  winogradInputLayout,
  winogradOutputLayout,
} from './kernels/layouts.ts';
import {
  WINOGRAD_F4_COEFFICIENTS,
  WINOGRAD_GEMM_F16_OUTPUT_BLOCK_TILE,
  WINOGRAD_GEMM_F16_TILE_TILE,
  WINOGRAD_GEMM_F32_OUTPUT_BLOCK_TILE,
  WINOGRAD_GEMM_F32_TILE_TILE,
  shapeKey,
  winogradGemmPlanFor,
  type WinogradGemmShape,
} from './kernels/types.ts';
import {
  WINOGRAD_F4_PAIRS_PER_WORKGROUP,
  winogradF4InputTransformKernel,
  winogradF4OutputTransformKernel,
} from './kernels/winograd-f4.ts';
import {
  createSpecializedWinogradGemmKernel,
  winogradDestinationIsF16Slot,
  winogradGemmF16Kernel,
  winogradGemmF32Kernel,
  winogradSourceIsF16Slot,
  winogradTransformedInputIsF16Slot,
} from './kernels/winograd-gemm.ts';
import {
  DepthDType,
  DepthPrecision,
  type DepthBundle,
  type DepthDispatch,
  type DepthTensor,
} from './types.ts';
import { transformWinogradF4Weight } from './winograd-weight.ts';

const WINOGRAD_MINIMUM_OUTPUT_CHANNELS = 64;
const WINOGRAD_FP16_MINIMUM_OUTPUT_CHANNELS = 48;

interface WinogradConfig {
  readonly input: PlainHwc4Shape;
  readonly output: PlainHwc4Shape;
  readonly nativeF16: boolean;
  readonly tilesX: number;
  readonly tilesY: number;
  readonly tileCount: number;
  readonly inputBytes: number;
  readonly outputBytes: number;
}

function winogradConfig(bundle: DepthBundle, record: DepthDispatch): WinogradConfig | undefined {
  if (
    record.op !== 'conv2d' ||
    record.params.kernel[0] !== 3 ||
    record.params.kernel[1] !== 3 ||
    record.params.stride[0] !== 1 ||
    record.params.stride[1] !== 1 ||
    record.params.padding.some((value) => value !== 1) ||
    record.params.groups !== 1
  ) {
    return undefined;
  }
  const src = dispatchTensor(bundle, record, 'inputs', 0);
  const weight = dispatchTensor(bundle, record, 'inputs', 1);
  const dst = dispatchTensor(bundle, record, 'outputs', 0);
  const input = plainHwc4Shape(src);
  const output = plainHwc4Shape(dst);
  const minimumOutputChannels =
    bundle.precision === DepthPrecision.Fp16Native
      ? WINOGRAD_FP16_MINIMUM_OUTPUT_CHANNELS
      : WINOGRAD_MINIMUM_OUTPUT_CHANNELS;
  if (
    output.channels < minimumOutputChannels ||
    input.width !== output.width ||
    input.height !== output.height
  ) {
    return undefined;
  }
  const nativeF16 = weight.dtype === DepthDType.F16;
  if (nativeF16 && input.dtype === DepthDType.F32 && output.dtype === DepthDType.F32) {
    return undefined;
  }
  const tilesX = Math.ceil(output.width / 4);
  const tilesY = Math.ceil(output.height / 4);
  const tileCount = tilesX * tilesY;
  const inputBytes =
    WINOGRAD_F4_COEFFICIENTS * tileCount * input.channelBlocks * (nativeF16 ? 8 : 16);
  const outputBytes = WINOGRAD_F4_COEFFICIENTS * tileCount * output.channelBlocks * 16;
  return { input, output, nativeF16, tilesX, tilesY, tileCount, inputBytes, outputBytes };
}

export interface ConvEnv {
  readonly src: DepthTensor;
  readonly weight: DepthTensor;
  readonly bias: DepthTensor;
  readonly dst: DepthTensor;
  readonly input: PlainHwc4Shape;
  readonly output: PlainHwc4Shape;
  readonly activation: Vec4Activation;
  readonly activationKey: string;
}

export interface WinogradDispatcher {
  /** Emits the three-stage Winograd dispatch when the record qualifies */
  readonly build: (record: DepthDispatch, env: ConvEnv) => boolean;
}

/** Claims every eligible 3x3 convolution and sizes the shared transform scratch */
export function createWinogradDispatcher(ctx: DispatchContext): WinogradDispatcher {
  const configs = new Map<string, WinogradConfig>();
  let maximumInputBytes = 0;
  let maximumOutputBytes = 0;
  for (const record of ctx.bundle.dispatches) {
    const config = winogradConfig(ctx.bundle, record);
    if (config !== undefined) {
      configs.set(record.id, config);
      maximumInputBytes = Math.max(maximumInputBytes, config.inputBytes);
      maximumOutputBytes = Math.max(maximumOutputBytes, config.outputBytes);
    }
  }
  const scratchFor = (byteLength: number) =>
    ctx.root.unwrap(
      ctx.own(ctx.root.createBuffer(d.arrayOf(d.u32, byteLength / 4)).$usage('storage')),
    );
  const inputScratch = maximumInputBytes === 0 ? undefined : scratchFor(maximumInputBytes);
  const outputScratch = maximumOutputBytes === 0 ? undefined : scratchFor(maximumOutputBytes);

  const build = (record: DepthDispatch, env: ConvEnv): boolean => {
    const config = configs.get(record.id);
    if (config === undefined) {
      return false;
    }
    const { input, output, activation, activationKey } = env;
    const transformed = transformWinogradF4Weight(
      ctx.bundle,
      env.weight,
      output.channels,
      input.channels,
    );
    const transformedWeight = ctx.storageFromBytes(transformed.bytes);
    const winogradParams = ctx.uniform(WinogradUniforms, {
      width: output.width,
      height: output.height,
      inputChannelBlocks: input.channelBlocks,
      outputChannelBlocks: output.channelBlocks,
      logicalOutputChannels: output.channels,
      tilesX: config.tilesX,
      tilesY: config.tilesY,
      tileCount: config.tileCount,
      weightBasePairs: 0,
      biasBase: vec4Base(env.bias),
    });
    const precisionKey = config.nativeF16 ? 'native-f16' : 'f32';
    const inputPipeline = ctx.pipelineFor(
      `winograd-f4-input-${input.dtype}-to-${precisionKey}`,
      () =>
        ctx.root
          .with(winogradSourceIsF16Slot, input.dtype === DepthDType.F16)
          .with(winogradTransformedInputIsF16Slot, config.nativeF16)
          .createComputePipeline({ compute: winogradF4InputTransformKernel }),
    );
    const gemmShape: WinogradGemmShape = {
      tileCount: config.tileCount,
      inputChannelBlocks: input.channelBlocks,
      outputChannelBlocks: output.channelBlocks,
    };
    const gemmPlan = winogradGemmPlanFor(gemmShape);
    const gemmPipeline = gemmPlan
      ? ctx.pipelineFor(`winograd-f4-gemm-${shapeKey(gemmShape)}-${precisionKey}`, () =>
          ctx.root.createComputePipeline({
            compute: createSpecializedWinogradGemmKernel(
              gemmShape,
              gemmPlan.tile,
              config.nativeF16,
            ),
          }),
        )
      : ctx.pipelineFor(`winograd-f4-gemm-${precisionKey}`, () =>
          ctx.root.createComputePipeline({
            compute: config.nativeF16 ? winogradGemmF16Kernel : winogradGemmF32Kernel,
          }),
        );
    const outputPipeline = ctx.pipelineFor(
      `winograd-f4-output-${output.dtype}-${activationKey}`,
      () =>
        ctx.root
          .with(activationSlot, activation)
          .with(winogradDestinationIsF16Slot, output.dtype === DepthDType.F16)
          .createComputePipeline({ compute: winogradF4OutputTransformKernel }),
    );
    ctx.dispatches.push(
      {
        pipeline: inputPipeline,
        bindGroup: ctx.root.createBindGroup(winogradInputLayout, {
          params: winogradParams,
          src: ctx.arena.rawBufferFor(env.src.id),
          dst: inputScratch as GPUBuffer,
        }),
        workgroups: splitWorkgroups(
          Math.ceil((config.tileCount * input.channelBlocks) / WINOGRAD_F4_PAIRS_PER_WORKGROUP),
        ),
      },
      {
        pipeline: gemmPipeline,
        bindGroup: ctx.root.createBindGroup(winogradGemmLayout, {
          params: winogradParams,
          src: inputScratch as GPUBuffer,
          weights: transformedWeight,
          dst: outputScratch as GPUBuffer,
        }),
        workgroups: gemmPlan?.workgroups ?? {
          x: Math.ceil(
            output.channelBlocks /
              (config.nativeF16
                ? WINOGRAD_GEMM_F16_OUTPUT_BLOCK_TILE
                : WINOGRAD_GEMM_F32_OUTPUT_BLOCK_TILE),
          ),
          y: Math.ceil(
            config.tileCount /
              (config.nativeF16 ? WINOGRAD_GEMM_F16_TILE_TILE : WINOGRAD_GEMM_F32_TILE_TILE),
          ),
          z: WINOGRAD_F4_COEFFICIENTS,
        },
      },
      {
        pipeline: outputPipeline,
        bindGroup: ctx.root.createBindGroup(winogradOutputLayout, {
          params: winogradParams,
          src: outputScratch as GPUBuffer,
          bias: sectionBinding(ctx.bundle, ctx.weights, env.bias),
          dst: ctx.arena.rawBufferFor(env.dst.id),
        }),
        workgroups: splitWorkgroups(
          Math.ceil((config.tileCount * output.channelBlocks) / WINOGRAD_F4_PAIRS_PER_WORKGROUP),
        ),
      },
    );
    return true;
  };

  return { build };
}
