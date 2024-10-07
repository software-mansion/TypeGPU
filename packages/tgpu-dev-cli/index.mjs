// @ts-check

/**
 * @typedef {Object} BuildScriptEnv
 * @prop {boolean} inDevMode
 * @prop {'standard'|'experimental'} featureSet
 */

/**
 * @returns {BuildScriptEnv}
 */
export function initBuildScript() {
  const inDevMode = process.env.DEV === 'true';
  const featureSet =
    process.env.EXPERIMENTAL === 'true' ? 'experimental' : 'standard';

  console.log(`-= ${inDevMode ? 'DEVELOPMENT' : 'PRODUCTION'} MODE =-`);
  console.log(`feature-set: ${featureSet}\n\n`);

  return {
    inDevMode,
    featureSet,
  };
}
