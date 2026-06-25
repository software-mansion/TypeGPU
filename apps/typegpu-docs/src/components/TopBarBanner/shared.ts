const MIN_VISIBLE_HEIGHT = 5;

const CACHE_PREFIX = 'swm.topbarbanner.v1';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const VAR_HEIGHT_PREFIX = '--banner-height';
const VAR_BG_PREFIX = '--banner-bg';

export const cacheKey = (zoneId: string, contentId: string) =>
  `${CACHE_PREFIX}.${zoneId}.${contentId}`;

export const varNames = (zoneId: string, contentId: string) => {
  const suffix = `${zoneId}-${contentId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    height: `${VAR_HEIGHT_PREFIX}-${suffix}`,
    bg: `${VAR_BG_PREFIX}-${suffix}`,
  };
};

export { MIN_VISIBLE_HEIGHT };

export interface BannerZone {
  zoneId: string;
  contentId: string;
  fallbackBgColor?: string;
}

export const isBannerHidden = (pathname: string, hiddenPaths?: string[]) =>
  !!hiddenPaths?.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Inline `<head>` script that reserves the cached banner size on `<html>`
 * before the body paints. Skips reserving on `hiddenPaths` (checked against
 * `location.pathname`) so blacklisted pages don't reserve a bar that never shows.
 */
export const topBarBannerReservationScript = (
  zoneId: string,
  contentId: string,
  hiddenPaths?: string[],
) => {
  const vars = varNames(zoneId, contentId);
  return (
    `(function(){try{` +
    `var hp=${JSON.stringify(hiddenPaths ?? [])};var p=location.pathname;` +
    `if(hp.some(function(x){return p===x||p.indexOf(x+"/")===0}))return;` +
    `var k=${JSON.stringify(cacheKey(zoneId, contentId))};` +
    `var raw=localStorage.getItem(k);if(!raw)return;` +
    `var c=JSON.parse(raw);` +
    `if(!c||typeof c.height!=="number"||c.height<${MIN_VISIBLE_HEIGHT})return;` +
    `if(Date.now()-c.timestamp>=${CACHE_TTL_MS})return;` +
    `var r=document.documentElement;` +
    `r.style.setProperty(${JSON.stringify(vars.height)},c.height+"px");` +
    `if(typeof c.bgColor==="string")r.style.setProperty(${JSON.stringify(vars.bg)},c.bgColor);` +
    `}catch(e){}})();`
  );
};
