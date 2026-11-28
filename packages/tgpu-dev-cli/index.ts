// Exported for use in other packages (e.g. in their build configs), so it has to stay
// runnable by Node (no Bun APIs, and only erasable TypeScript syntax).

export interface BuildScriptEnv {
  inDevMode: boolean;
}

export function initBuildScript(): BuildScriptEnv {
  const inDevMode = process.env.DEV === 'true';

  console.log(`-= ${inDevMode ? 'DEVELOPMENT' : 'PRODUCTION'} MODE =-`);

  return {
    inDevMode,
  };
}
