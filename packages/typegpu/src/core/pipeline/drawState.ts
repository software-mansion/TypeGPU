import { $internal } from '../../shared/symbols.ts';
import type { TgpuBindGroup, TgpuBindGroupLayout } from '../../tgpuBindGroupLayout.ts';
import { logDataFromGPU } from '../../tgsl/consoleLog/deserializers.ts';
import type { LogResources } from '../../tgsl/consoleLog/types.ts';
import type { TgpuCommandEncoder } from '../commandEncoder/commandEncoder.ts';
import type { ComputePassInternals } from '../commandEncoder/computePass.ts';
import type { RenderPassInternals } from '../commandEncoder/renderPass.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import type { TgpuVertexLayout } from '../vertexLayout/vertexLayout.ts';
import {
  applyBindGroups,
  applyIndexBuffer,
  applyVertexBuffers,
  type IndexBufferEntry,
  type VertexBufferEntry,
} from './applyPipelineState.ts';
import type { TgpuComputePipeline } from './computePipeline.ts';
import type { TgpuRenderPipeline } from './renderPipeline.ts';

export class RenderDrawState {
  readonly bindGroups = new Map<TgpuBindGroupLayout, TgpuBindGroup | GPUBindGroup>();
  readonly vertexBuffers = new Map<TgpuVertexLayout, VertexBufferEntry>();
  currentPipeline: TgpuRenderPipeline | undefined;
  indexBuffer: IndexBufferEntry | undefined;
  stencilReference: GPUStencilValue | undefined;
  /**
   * The stencil reference currently set on the raw pass — 0 is the WebGPU
   * default, and render bundles cannot change it, so it survives executeBundles.
   */
  appliedStencilReference: GPUStencilValue = 0;
  version = 0;
  /**
   * Set once the raw pass encoder has been handed out via `root.unwrap(pass)`.
   * Raw calls can mutate pass state invisibly, so state deduplication is
   * disabled from that point on.
   */
  rawAccessed = false;
}

export class ComputeDrawState {
  readonly bindGroups = new Map<TgpuBindGroupLayout, TgpuBindGroup | GPUBindGroup>();
  currentPipeline: TgpuComputePipeline | undefined;
  version = 0;
  rawAccessed = false;
}

export function applyRenderPipelineState(
  encoder: GPURenderPassEncoder | GPURenderBundleEncoder,
  root: ExperimentalTgpuRoot,
  pipeline: TgpuRenderPipeline,
  passState: RenderDrawState,
): void {
  const { core, priors } = pipeline[$internal];
  const memo = core.unwrap();
  encoder.setPipeline(memo.pipeline);

  applyBindGroups(
    encoder,
    root,
    memo.usedBindGroupLayouts,
    memo.catchall,
    (layout) => priors.bindGroupLayoutMap?.get(layout) ?? passState.bindGroups.get(layout),
  );

  applyVertexBuffers(encoder, root, memo.usedVertexLayouts, (vertexLayout) => {
    const priorBuffer = priors.vertexLayoutMap?.get(vertexLayout);
    return priorBuffer
      ? { buffer: priorBuffer, offset: undefined, size: undefined }
      : passState.vertexBuffers.get(vertexLayout);
  });

  const indexBuffer = priors.indexBuffer ?? passState.indexBuffer;
  if (indexBuffer !== undefined) {
    applyIndexBuffer(encoder, root, indexBuffer);
  }

  if ('setStencilReference' in encoder) {
    const stencilReference = priors.stencilReference ?? passState.stencilReference ?? 0;
    if (passState.rawAccessed || stencilReference !== passState.appliedStencilReference) {
      encoder.setStencilReference(stencilReference);
      passState.appliedStencilReference = stencilReference;
    }
  }
}

export function applyComputePipelineState(
  encoder: GPUComputePassEncoder,
  root: ExperimentalTgpuRoot,
  pipeline: TgpuComputePipeline,
  passState: ComputeDrawState,
): void {
  const { core, priors } = pipeline[$internal];
  const memo = core.unwrap();
  encoder.setPipeline(memo.pipeline);

  applyBindGroups(
    encoder,
    root,
    memo.usedBindGroupLayouts,
    memo.catchall,
    (layout) => priors.bindGroupLayoutMap?.get(layout) ?? passState.bindGroups.get(layout),
  );
}

/**
 * Guards an indexed draw, given the index buffer the pipeline was configured
 * with and the one set on the pass it draws into (if any).
 */
export function requireIndexBuffer(
  priorIndexBuffer: IndexBufferEntry | undefined,
  passIndexBuffer: IndexBufferEntry | undefined,
): void {
  if (!priorIndexBuffer && !passIndexBuffer) {
    throw new Error(
      'No index buffer is set. Call pipeline.withIndexBuffer or pass.setIndexBuffer before drawing indexed geometry.',
    );
  }
}

const _warnedIgnoredTimestamps = new WeakSet<object>();
const _warnedIgnoredLogs = new WeakSet<object>();

const _warnedUnreachableSubmission = new WeakMap<object, Set<string>>();

/**
 * Warns that work which can only be reported after submission is lost, because
 * the raw encoder belongs to the caller and is submitted behind our back.
 */
export function warnAboutUnreachableSubmission(core: object, what: string): void {
  let warned = _warnedUnreachableSubmission.get(core);

  if (!warned) {
    warned = new Set();
    _warnedUnreachableSubmission.set(core, warned);
  }

  if (warned.has(what)) {
    return;
  }
  warned.add(what);

  console.warn(
    `${what} is ignored when recording into a raw GPUCommandEncoder, since there is no submission to report after. Use root['~unstable'].createCommandEncoder() instead.`,
  );
}

/**
 * Queues a drain of the shader's log buffers for after the encoder is
 * submitted. Returns false when there is no encoder to defer the read to,
 * meaning the output is lost.
 */
export function queueLogDrain(
  encoder: TgpuCommandEncoder | undefined,
  logResources: LogResources,
): boolean {
  if (!encoder || encoder[$internal].adopted) {
    return false;
  }

  encoder[$internal].afterSubmit.set(logResources, () => logDataFromGPU(logResources));
  return true;
}

/**
 * Reports the pass-level priors that a pipeline cannot honor, because the pass
 * it draws into was begun by someone else. Shader logs are the exception: they
 * are read back after submission, so they can still be drained as long as the
 * pass belongs to a TypeGPU encoder.
 */
function reportIgnoredPriors(
  core: object,
  owner: TgpuCommandEncoder | undefined,
  hasTimestampWrites: boolean,
  logResources: LogResources | undefined,
  passKind: 'render' | 'compute',
): void {
  if (hasTimestampWrites && !_warnedIgnoredTimestamps.has(core)) {
    _warnedIgnoredTimestamps.add(core);
    console.warn(
      `Pipeline-level timestamp writes are ignored when ${
        passKind === 'render' ? 'drawing into a render pass' : 'dispatching into a compute pass'
      }. Pass \`timestampWrites\` to encoder.begin${
        passKind === 'render' ? 'Render' : 'Compute'
      }Pass instead.`,
    );
  }

  if (logResources && !queueLogDrain(owner, logResources) && !_warnedIgnoredLogs.has(core)) {
    _warnedIgnoredLogs.add(core);
    console.warn(
      `Shader console.log output is ignored when ${
        passKind === 'render'
          ? 'drawing into a raw render pass'
          : 'dispatching into a raw compute pass'
      } encoder, since there is no submission to read it back after.`,
    );
  }
}

/**
 * Records a draw into a typed render pass, applying the pipeline's state
 * (and the pass's, where the pipeline does not override it) beforehand.
 * The single route every draw takes, whether the pass is the pipeline's own,
 * one it was handed (`pipeline.with(pass).draw()`), or one driving it
 * (`pass.setPipeline(pipeline)` followed by `pass.draw()`).
 *
 * @param ownsPass - Whether the pipeline began this pass itself, and so honors
 *   its own pass-level priors instead of dropping them.
 */
export function emitRenderDraw(
  root: ExperimentalTgpuRoot,
  passInternals: RenderPassInternals,
  pipeline: TgpuRenderPipeline,
  usesIndexBuffer: boolean,
  emit: (rawPass: GPURenderPassEncoder | GPURenderBundleEncoder) => void,
  ownsPass = false,
): void {
  const { state, rawPass } = passInternals;
  const { core, priors } = pipeline[$internal];

  if (usesIndexBuffer) {
    requireIndexBuffer(priors.indexBuffer, state.indexBuffer);
  }

  const memo = core.unwrap();
  if (!ownsPass) {
    reportIgnoredPriors(
      core,
      passInternals.owner,
      !!priors.timestampWrites,
      memo.logResources,
      'render',
    );
  }

  if (
    state.rawAccessed ||
    passInternals.lastApplied?.pipeline !== pipeline ||
    passInternals.lastApplied.version !== state.version
  ) {
    applyRenderPipelineState(rawPass, root, pipeline, state);
    passInternals.lastApplied = { pipeline, version: state.version };
  }

  emit(rawPass);
}

/**
 * The compute counterpart of {@link emitRenderDraw}.
 */
export function emitComputeDispatch(
  root: ExperimentalTgpuRoot,
  passInternals: ComputePassInternals,
  pipeline: TgpuComputePipeline,
  emit: (rawPass: GPUComputePassEncoder) => void,
  ownsPass = false,
): void {
  const { state, rawPass } = passInternals;
  const { core, priors } = pipeline[$internal];

  const memo = core.unwrap();
  if (!ownsPass) {
    reportIgnoredPriors(
      core,
      passInternals.owner,
      !!priors.timestampWrites,
      memo.logResources,
      'compute',
    );
  }

  if (
    state.rawAccessed ||
    passInternals.lastApplied?.pipeline !== pipeline ||
    passInternals.lastApplied.version !== state.version
  ) {
    applyComputePipelineState(rawPass, root, pipeline, state);
    passInternals.lastApplied = { pipeline, version: state.version };
  }

  emit(rawPass);
}
