import { useRef } from 'react';
import { WGSLRuntime } from 'wigsill';
import * as dat from 'dat.gui';

import { useRuntime } from '../common/useRuntime';

async function init(canvas: HTMLCanvasElement) {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter!.requestDevice();
  const runtime = new WGSLRuntime(device);

  return {};
}

export function RandomTilesExample() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtime = useRuntime();

  return <canvas ref={canvasRef}></canvas>;
}
