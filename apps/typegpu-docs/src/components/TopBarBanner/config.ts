import type { BannerZone } from './shared';

export const TOP_BAR_BANNER = {
  rotateIntervalMs: 4000,
  hiddenPaths: ['/TypeGPU/examples'] as string[],
  zones: [
    {
      zoneId: 'typegpu-topbar-1',
      contentId: 'ea15c4216158c4097b65fe6504a4b3b7',
      fallbackBgColor: '#38acdd',
    },
    {
      zoneId: 'typegpu-topbar-2',
      contentId: 'ea15c4216158c4097b65fe6504a4b3b7',
      fallbackBgColor: '#38acdd',
    },
    {
      zoneId: 'typegpu-topbar-3',
      contentId: 'ea15c4216158c4097b65fe6504a4b3b7',
      fallbackBgColor: '#38acdd',
    },
  ] satisfies BannerZone[],
};
