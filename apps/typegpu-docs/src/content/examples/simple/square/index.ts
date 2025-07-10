import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

const root = await tgpu.init();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const colors = {
  bottomLeft: d.vec4f(1, 0, 0, 1),
  bottomRight: d.vec4f(0, 1, 0, 1),
  topRight: d.vec4f(0, 0, 1, 1),
  topLeft: d.vec4f(1, 1, 0, 1),
};

const colorIndices = {
  bottomLeft: 0,
  bottomRight: 1,
  topRight: 2,
  topLeft: 3,
} as const;

const colorBuffer = root
  .createBuffer(d.arrayOf(d.vec4f, 4), Object.values(colors))
  .$usage('vertex');
const vertexLayout = tgpu.vertexLayout((n) => d.arrayOf(d.vec4f, n));

const vertex = tgpu['~unstable'].vertexFn({
  in: {
    idx: d.builtin.vertexIndex,
    color: d.vec4f,
  },
  out: {
    color: d.vec4f,
    pos: d.builtin.position,
  },
})(({ idx, color }) => {
  const vertices = [
    d.vec2f(-1, -1),
    d.vec2f(1, -1),
    d.vec2f(1, 1),
    d.vec2f(-1, 1),
  ];
  return {
    color,
    pos: d.vec4f(vertices[idx], 0, 1),
  };
});

const mainFragment = tgpu['~unstable'].fragmentFn({
  in: {
    color: d.vec4f,
  },
  out: d.vec4f,
})((input) => input.color);

const indexBuffer = root
  .createBuffer(d.arrayOf(d.u16, 6), [0, 2, 1, 0, 3, 2])
  .$usage('index');

const pipeline = root['~unstable']
  .withVertex(vertex, { color: vertexLayout.attrib })
  .withFragment(mainFragment, { format: presentationFormat })
  .createPipeline()
  .withIndexBuffer(indexBuffer);

function render() {
  pipeline
    .with(vertexLayout, colorBuffer)
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .drawIndexed(6);
}
render();

// #region Example controls & Cleanup

function updateColor(
  color: readonly [number, number, number],
  position: keyof typeof colors,
): void {
  colors[position] = d.vec4f(...color, 1);
  const idx = colorIndices[position];
  colorBuffer.writePartial([
    {
      idx,
      value: colors[position],
    },
  ]);
  render();
}

export const controls = {
  topLeft: {
    onColorChange: (value: readonly [number, number, number]) =>
      updateColor(value, 'topLeft'),
    initial: [...colors.topLeft.xyz],
  },
  topRight: {
    onColorChange: (value: readonly [number, number, number]) =>
      updateColor(value, 'topRight'),
    initial: [...colors.topRight.xyz],
  },
  bottomLeft: {
    onColorChange: (value: readonly [number, number, number]) =>
      updateColor(value, 'bottomLeft'),
    initial: [...colors.bottomLeft.xyz],
  },
  bottomRight: {
    onColorChange: (value: readonly [number, number, number]) =>
      updateColor(value, 'bottomRight'),
    initial: [...colors.bottomRight.xyz],
  },
};

export function onCleanup() {
  root.destroy();
}
// #endregion
