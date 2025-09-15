import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as m from 'wgpu-matrix';

// == BORING ROOT STUFF ==
const root = await tgpu.init();
const device = root.device;
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// == VERTEX DATA ==
const Vertex = d.struct({
  position: d.vec4f,
  color: d.vec4f,
});

const vertexLayout = tgpu.vertexLayout(d.arrayOf(Vertex));

// == PERSPECTIVE ==
const aspect = canvas.clientWidth / canvas.clientHeight;
const target = d.vec3f(0, 0, 0);
const cameraInitialPos = d.vec4f(12, 5, 12, 1);

const cameraInitial = {
  view: m.mat4.lookAt(cameraInitialPos, target, d.vec3f(0, 1, 0), d.mat4x4f()),
  projection: m.mat4.perspective(Math.PI / 4, aspect, 0.1, 1000, d.mat4x4f()),
};
