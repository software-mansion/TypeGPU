export function createStatsDisplay(el: HTMLElement) {
  return {
    setDrawMode(nodeCount: number) {
      const need = 4 - nodeCount;
      const ready =
        nodeCount >= 4 ? '— ready to confirm!' : `— need ${need} more node${need === 1 ? '' : 's'}`;
      el.textContent =
        `Draw mode  |  Click: add node  |  Drag: move node  |  RMB: remove last  |  ` +
        `${nodeCount} node${nodeCount === 1 ? '' : 's'} ${ready}`;
    },

    setSimulation(gen: number, step: number, stepsPerGen: number, pop: number, best: number) {
      el.textContent =
        `Gen ${String(gen).padStart(5)}  ` +
        `Step ${String(step).padStart(String(stepsPerGen).length)}/${stepsPerGen}  ` +
        `Pop ${pop}  Best ${best.toFixed(2).padStart(6)}`;
    },
  };
}
