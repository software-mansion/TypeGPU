import tgpu, {
  type IndexFlag,
  type TgpuBindGroup,
  type TgpuBuffer,
  type VertexFlag,
} from 'typegpu';
import * as d from 'typegpu/data';
import * as m from 'wgpu-matrix';
import * as std from 'typegpu/std';

import { Camera, Transform, Vertex } from './structures.ts';
import * as c from './constants.ts';
import {
  createSurface,
  getSurfaceIndexArray,
  getSurfaceTransform,
} from './surface.ts';

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

// == SCENE ==
const aspect = canvas.clientWidth / canvas.clientHeight;

const cameraInitial: d.Infer<typeof Camera> = {
  view: m.mat4.lookAt(
    c.cameraInitialPos,
    c.target,
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  ),
  projection: m.mat4.perspective(Math.PI / 4, aspect, 0.1, 1000, d.mat4x4f()),
};

// == BUFFERS AND LAYOUTS ==
const vertexLayout = tgpu.vertexLayout(d.arrayOf(Vertex));
const cameraBuffer = root.createBuffer(Camera, cameraInitial).$usage('uniform');

// == THIS IS THE PLACE TO DECIDE WHAT FUNCTION TO PLOT ==
// import { rippleDeformator, rippleDrawer } from './.examples/ripple.ts';
// import {
//   mistyMountainsDeformator,
//   mistyMountainsDrawer,
// } from './.examples/misty.ts';
import { normalDeformator, normalDrawer } from './.examples/normal.ts';
import { planeDeformator, planeDrawer } from './plane.ts';

const currentDeformator = normalDeformator;
const currentDrawer = normalDrawer;
const rowsNumber = currentDeformator.n;
const columnsNumber = currentDeformator.m;

const planeBuffer = root
  .createBuffer(
    vertexLayout.schemaForCount(planeDeformator.n * planeDeformator.m),
    createSurface(planeDeformator, planeDrawer),
  )
  .$usage('vertex');

const planeIndexBuffer = root
  .createBuffer(
    d.arrayOf(
      d.u16,
      (planeDeformator.n - 1) * (planeDeformator.m - 1) * 6,
    ),
    getSurfaceIndexArray(planeDeformator.n, planeDeformator.m),
  )
  .$usage('index');

const surfaceBuffer = root
  .createBuffer(
    vertexLayout.schemaForCount(
      rowsNumber * columnsNumber,
    ),
    createSurface(currentDeformator, currentDrawer),
  )
  .$usage('vertex');

const surfaceIndexBuffer = root
  .createBuffer(
    d.arrayOf(
      d.u16,
      (rowsNumber - 1) * (columnsNumber - 1) * 6,
    ),
    getSurfaceIndexArray(rowsNumber, columnsNumber),
  )
  .$usage('index');

const surfaceTransformBuffer = root
  .createBuffer(
    Transform,
    getSurfaceTransform(c.surfaceTranslation, c.surfaceScale),
  )
  .$usage('uniform');

const layout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
  transform: { uniform: Transform },
});

const XZPlaneTransformBuffer = root
  .createBuffer(
    Transform,
    getSurfaceTransform(c.planeTranslation, c.planeScale),
  )
  .$usage('uniform');

const XZPlaneBindgroup = root.createBindGroup(layout, {
  camera: cameraBuffer,
  transform: XZPlaneTransformBuffer,
});

const YZPlaneTransformBuffer = root
  .createBuffer(
    Transform,
    {
      model: m.mat4.rotateZ(
        getSurfaceTransform(c.planeTranslation, c.planeScale).model,
        Math.PI / 2,
        d.mat4x4f(),
      ),
    },
  )
  .$usage('uniform');

const YZPlaneBindgroup = root.createBindGroup(layout, {
  camera: cameraBuffer,
  transform: YZPlaneTransformBuffer,
});

// WIP
const XYPlaneTransformBuffer = root
  .createBuffer(
    Transform,
    {
      model: m.mat4.rotateX(
        getSurfaceTransform(c.planeTranslation, c.planeScale).model,
        Math.PI / 2,
        d.mat4x4f(),
      ),
    },
  )
  .$usage('uniform');

const XYPlaneBindgroup = root.createBindGroup(layout, {
  camera: cameraBuffer,
  transform: XYPlaneTransformBuffer,
});

const surfaceBindgroup = root.createBindGroup(layout, {
  camera: cameraBuffer,
  transform: surfaceTransformBuffer,
});

// == TEXTURES ==
let depthTexture: GPUTexture;
let depthTextureView: GPUTextureView;
let msaaTexture: GPUTexture;
let msaaTextureView: GPUTextureView;

const createDepthAndMsaaTextures = () => {
  if (depthTexture) {
    depthTexture.destroy();
  }
  depthTexture = device.createTexture({
    size: [canvas.width, canvas.height, 1],
    format: 'depth24plus',
    sampleCount: 4,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  depthTextureView = depthTexture.createView();

  if (msaaTexture) {
    msaaTexture.destroy();
  }
  msaaTexture = device.createTexture({
    size: [canvas.width, canvas.height, 1],
    format: presentationFormat,
    sampleCount: 4,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  msaaTextureView = msaaTexture.createView();
};
createDepthAndMsaaTextures();

// == SHADERS ==
const vertex = tgpu['~unstable'].vertexFn({
  in: { position: d.vec4f, color: d.vec4f },
  out: { pos: d.builtin.position, color: d.vec4f },
})((input) => {
  const pos = std.mul(
    layout.$.camera.projection,
    std.mul(
      layout.$.camera.view,
      std.mul(layout.$.transform.model, input.position),
    ),
  );
  return { pos, color: input.color };
});

const fragment = tgpu['~unstable'].fragmentFn({
  in: { color: d.vec4f },
  out: d.vec4f,
})((input) => input.color);

const pipeline = root['~unstable']
  .withVertex(vertex, vertexLayout.attrib)
  .withFragment(fragment, {
    format: presentationFormat,
    blend: {
      color: {
        srcFactor: 'src-alpha',
        dstFactor: 'one-minus-src-alpha',
        operation: 'add',
      },
      alpha: {
        srcFactor: 'one',
        dstFactor: 'one-minus-src-alpha',
        operation: 'add',
      },
    },
  })
  .withDepthStencil({
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  })
  .withMultisample({
    count: 4,
  })
  .createPipeline();

const drawObject = (
  buffer: TgpuBuffer<d.WgslArray<typeof Vertex>> & VertexFlag,
  group: TgpuBindGroup<typeof layout.entries>,
  indexBuffer: TgpuBuffer<d.WgslArray<d.U16>> & IndexFlag,
  vertexCount: number,
  loadOp: 'clear' | 'load',
) => {
  pipeline
    .withColorAttachment({
      view: msaaTextureView,
      resolveTarget: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 0],
      loadOp: loadOp,
      storeOp: 'store',
    })
    .withDepthStencilAttachment({
      view: depthTextureView,
      depthClearValue: 1,
      depthLoadOp: loadOp,
      depthStoreOp: 'store',
    })
    .with(vertexLayout, buffer)
    .with(layout, group)
    .withIndexBuffer(indexBuffer)
    .drawIndexed(vertexCount);
};

// == RENDER LOOP ==
const render = () => {
  drawObject(
    surfaceBuffer,
    surfaceBindgroup,
    surfaceIndexBuffer,
    (rowsNumber - 1) * (columnsNumber - 1) * 6,
    'clear',
  );

  if (currentDrawer.drawXZPlane) {
    drawObject(
      planeBuffer,
      XZPlaneBindgroup,
      planeIndexBuffer,
      (planeDeformator.n - 1) * (planeDeformator.m - 1) * 6,
      'load',
    );
  }

  if (currentDrawer.drawYZPlane) {
    drawObject(
      planeBuffer,
      YZPlaneBindgroup,
      planeIndexBuffer,
      (planeDeformator.n - 1) * (planeDeformator.m - 1) * 6,
      'load',
    );
  }

  if (currentDrawer.drawXYPlane) {
    drawObject(
      planeBuffer,
      XYPlaneBindgroup,
      planeIndexBuffer,
      (planeDeformator.n - 1) * (planeDeformator.m - 1) * 6,
      'load',
    );
  }
};

const frame = () => {
  render();
  requestAnimationFrame(frame);
};

frame();

// #region Example controls and cleanup
// copied from 'Two Boxes' example

let isDragging = false;
let prevX = 0;
let prevY = 0;
let orbitRadius = std.length(c.cameraInitialPos.xyz);

let orbitYaw = Math.atan2(c.cameraInitialPos.x, c.cameraInitialPos.z);
let orbitPitch = Math.asin(c.cameraInitialPos.y / orbitRadius);

const updateCameraOrbit = (dx: number, dy: number) => {
  const orbitSensitivity = 0.005;
  orbitYaw += -dx * orbitSensitivity;
  orbitPitch += dy * orbitSensitivity;
  const maxPitch = Math.PI / 2 - 0.01;
  if (orbitPitch > maxPitch) orbitPitch = maxPitch;
  if (orbitPitch < -maxPitch) orbitPitch = -maxPitch;
  const newCamX = orbitRadius * Math.sin(orbitYaw) * Math.cos(orbitPitch);
  const newCamY = orbitRadius * Math.sin(orbitPitch);
  const newCamZ = orbitRadius * Math.cos(orbitYaw) * Math.cos(orbitPitch);
  const newCameraPos = d.vec4f(newCamX, newCamY, newCamZ, 1);

  const newView = m.mat4.lookAt(
    newCameraPos,
    c.target,
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  );
  cameraBuffer.write({ view: newView, projection: cameraInitial.projection });
};

canvas.addEventListener('contextmenu', (event: MouseEvent) => {
  event.preventDefault();
});

canvas.addEventListener('wheel', (event: WheelEvent) => {
  event.preventDefault();
  const zoomSensitivity = 0.05;
  orbitRadius = Math.max(7, orbitRadius + event.deltaY * zoomSensitivity);
  const newCamX = orbitRadius * Math.sin(orbitYaw) * Math.cos(orbitPitch);
  const newCamY = orbitRadius * Math.sin(orbitPitch);
  const newCamZ = orbitRadius * Math.cos(orbitYaw) * Math.cos(orbitPitch);
  const newCameraPos = d.vec4f(newCamX, newCamY, newCamZ, 1);
  const newView = m.mat4.lookAt(
    newCameraPos,
    c.target,
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  );
  cameraBuffer.writePartial({ view: newView });
}, { passive: false });

canvas.addEventListener('mousedown', (event) => {
  if (event.button === 0) {
    isDragging = true;
  }
  prevX = event.clientX;
  prevY = event.clientY;
});

const mouseUpEventListener = () => {
  isDragging = false;
};
window.addEventListener('mouseup', mouseUpEventListener);

canvas.addEventListener('mousemove', (event) => {
  const dx = event.clientX - prevX;
  const dy = event.clientY - prevY;
  prevX = event.clientX;
  prevY = event.clientY;

  if (isDragging) {
    updateCameraOrbit(dx, dy);
  }
});

const resizeObserver = new ResizeObserver(() => {
  createDepthAndMsaaTextures();
});
resizeObserver.observe(canvas);

export function onCleanup() {
  window.removeEventListener('mouseup', mouseUpEventListener);
  resizeObserver.disconnect();
  root.destroy();
}

// #endregion
