// @ts-check

/**
 * @typedef {Object} BuildScriptEnv
 * @prop {boolean} inDevMode
 */

/**
 * @returns {BuildScriptEnv}
 */
export function initBuildScript() {
  const inDevMode = process.env.DEV === 'true';

  console.log(`-= ${inDevMode ? 'DEVELOPMENT' : 'PRODUCTION'} MODE =-`);

  return {
    inDevMode,
  };
}
