import { d, type TgpuRoot } from 'typegpu';
import type { LayerData } from './data.ts';

/**
 * The function extracts the header, shape and data from the layer
 * If there are any issues with the layer, an error is thrown
 */
function getLayerData(layer: ArrayBuffer): {
  shape: readonly [number] | readonly [number, number];
  data: Float32Array;
} {
  const headerLen = new Uint16Array(layer.slice(8, 10));

  const header = new TextDecoder().decode(
    new Uint8Array(layer.slice(10, 10 + headerLen[0])),
  );

  // shape can be found in the header in the format: 'shape': (x, y) or 'shape': (x,) for bias
  const shapeMatch = header.match(/'shape': \((\d+), ?(\d+)?\)/);
  if (!shapeMatch) {
    throw new Error('Shape not found in header');
  }

  // To accommodate .npy weirdness - if we have a 2d shape we need to switch the order
  const X = Number.parseInt(shapeMatch[1]);
  const Y = Number.parseInt(shapeMatch[2]);
  const shape = Number.isNaN(Y) ? ([X] as const) : ([Y, X] as const);

  const data = new Float32Array(layer.slice(10 + headerLen[0]));

  // Verify the length of the data matches the shape
  if (data.length !== shape[0] * (shape[1] || 1)) {
    throw new Error(`Data length ${data.length} does not match shape ${shape}`);
  }

  return {
    shape,
    data,
  };
}

export function downloadLayers(
  root: TgpuRoot,
): Promise<[LayerData, LayerData][]> {
  const downloadLayer = async (fileName: string): Promise<LayerData> => {
    const buffer = await fetch(
      `/TypeGPU/assets/mnist-weights/${fileName}`,
    ).then((res) => res.arrayBuffer());

    const { shape, data } = getLayerData(buffer);

    const layerBuffer = root
      .createBuffer(d.arrayOf(d.f32, data.length), [...data])
      .$usage('storage');

    return {
      shape,
      buffer: layerBuffer,
    };
  };

  return Promise.all(
    [0, 1, 2, 3, 4, 5, 6, 7].map((layer) =>
      Promise.all([
        downloadLayer(`layer${layer}.weight.npy`),
        downloadLayer(`layer${layer}.bias.npy`),
      ])
    ),
  );
}
