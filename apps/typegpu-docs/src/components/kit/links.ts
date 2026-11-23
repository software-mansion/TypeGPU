/** Where TypeGPU Kit lives, and the command that starts a project with it. */
export const KIT_URL = 'https://docs.swmansion.com/typegpu-kit/';
export const KIT_COMMAND = 'npm create @typegpu/kit';

/** A page of Kit's docs, from its path under {@link KIT_URL}, e.g. `kit/profiler/`. */
export const kitPage = (path: string) => `${KIT_URL}${path}`;
