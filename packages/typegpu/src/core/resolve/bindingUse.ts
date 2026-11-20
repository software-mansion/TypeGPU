import type { TgpuLayoutEntry } from '../../tgpuBindGroupLayout.ts';
import type { ShaderStage } from '../../types.ts';
import { ALL_STAGES } from '../pipeline/webgpuLimitations.ts';
import { Probe } from './probe.ts';

export interface FixedBindingConfig {
  layoutEntry: TgpuLayoutEntry;
  resource: object;
}

export interface BindingUse {
  readonly binding: FixedBindingConfig;
  readonly entryStage: ShaderStage | 'none';
}

export const bindingUseProbe = new Probe<BindingUse>();

export function layoutEntryForUses(
  binding: FixedBindingConfig,
  uses: readonly BindingUse[],
): TgpuLayoutEntry {
  const stages = uses.filter((use) => use.binding === binding).map((use) => use.entryStage);
  if (stages.length === 0 || stages.includes('none')) {
    return binding.layoutEntry;
  }
  return {
    ...binding.layoutEntry,
    visibility: ALL_STAGES.filter((stage) => stages.includes(stage)),
  };
}
