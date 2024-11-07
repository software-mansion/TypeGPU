import type { TgpuBindGroupLayout } from '../../tgpuBindGroupLayout';

/**
 * A resource as seen accessed through a bind group layout.
 */
export interface TgpuLaidOut {
  layout: TgpuBindGroupLayout;
}
