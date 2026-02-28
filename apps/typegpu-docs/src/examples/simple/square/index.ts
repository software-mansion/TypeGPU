import tgpu, { d } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

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
const vertexLayout = tgpu.vertexLayout(d.arrayOf(d.vec4f));

const vertex = tgpu.vertexFn({
  in: {
    idx: d.builtin.vertexIndex,
    color: d.vec4f,
  },
  out: {
    color: d.vec4f,
    pos: d.builtin.position,
  },
})(({ idx, color }) => {
  const vertices = [d.vec2f(-1, -1), d.vec2f(1, -1), d.vec2f(1, 1), d.vec2f(-1, 1)];
  return {
    color,
    pos: d.vec4f(vertices[idx], 0, 1),
  };
});

const mainFragment = tgpu.fragmentFn({
  in: {
    color: d.vec4f,
  },
  out: d.vec4f,
})((input) => input.color);

const indexBuffer = root.createBuffer(d.arrayOf(d.u16, 6), [0, 2, 1, 0, 3, 2]).$usage('index');

const pipeline = root
  .createRenderPipeline({
    attribs: { color: vertexLayout.attrib },
    vertex,
    fragment: mainFragment,
  })
  .withIndexBuffer(indexBuffer);

function render() {
  pipeline.with(vertexLayout, colorBuffer).withColorAttachment({ view: context }).drawIndexed(6);
}
render();

// #region Example controls & Cleanup

function updateColor(color: d.v3f, position: keyof typeof colors): void {
  colors[position] = d.vec4f(color, 1);
  const idx = colorIndices[position];
  colorBuffer.writePartial([
    {
      idx,
      value: colors[position],
    },
  ]);
  render();
}

export const controls = defineControls({
  topLeft: {
    onColorChange: (value) => updateColor(value, 'topLeft'),
    initial: colors.topLeft.rgb,
  },
  topRight: {
    onColorChange: (value) => updateColor(value, 'topRight'),
    initial: colors.topRight.rgb,
  },
  bottomLeft: {
    onColorChange: (value) => updateColor(value, 'bottomLeft'),
    initial: colors.bottomLeft.rgb,
  },
  bottomRight: {
    onColorChange: (value) => updateColor(value, 'bottomRight'),
    initial: colors.bottomRight.rgb,
  },
});

export function onCleanup() {
  root.destroy();
}
// #endregion
