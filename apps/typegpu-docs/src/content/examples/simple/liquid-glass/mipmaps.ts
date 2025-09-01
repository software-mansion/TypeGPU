import tgpu, { type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export async function loadExternalImageWithMipmaps(
  root: TgpuRoot,
  imageUrl: string,
) {
  const response = await fetch(imageUrl);
  const imageBitmap = await createImageBitmap(await response.blob());

  const mipCount = Math.floor(
    Math.log2(Math.max(imageBitmap.width, imageBitmap.height)),
  ) + 1;

  const imageTexture = root['~unstable']
    .createTexture({
      size: [imageBitmap.width, imageBitmap.height],
      format: 'rgba8unorm',
      mipLevelCount: mipCount,
    })
    .$usage('sampled', 'render');

  const device = root.device;
  device.queue.copyExternalImageToTexture(
    { source: imageBitmap },
    { texture: root.unwrap(imageTexture) },
    [imageBitmap.width, imageBitmap.height],
  );

  const sampler = tgpu['~unstable'].sampler({
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
  });

  const downsampleLayout = tgpu.bindGroupLayout({
    source: { texture: 'float' },
  });

  const fullScreenTriangle = tgpu['~unstable'].vertexFn({
    in: { vertexIndex: d.builtin.vertexIndex },
    out: { pos: d.builtin.position, uv: d.vec2f },
  })((input) => {
    const pos = [d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)];
    const uv = [d.vec2f(0, 1), d.vec2f(2, 1), d.vec2f(0, -1)];

    return {
      pos: d.vec4f(pos[input.vertexIndex], 0, 1),
      uv: uv[input.vertexIndex],
    };
  });

  const downsampleFragment = tgpu['~unstable'].fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })(({ uv }) => {
    return std.textureSample(
      downsampleLayout.$.source,
      sampler,
      uv,
    );
  });

  const downsamplePipeline = root['~unstable']
    .withVertex(fullScreenTriangle, {})
    .withFragment(downsampleFragment, {
      format: 'rgba8unorm',
    })
    .createPipeline();

  function generateMipmaps() {
    let srcWidth = imageBitmap.width;
    let srcHeight = imageBitmap.height;
    for (let i = 1; i < mipCount; i++) {
      const dstWidth = Math.max(1, Math.floor(srcWidth / 2));
      const dstHeight = Math.max(1, Math.floor(srcHeight / 2));

      const sourceView = imageTexture.createView('sampled', {
        baseMipLevel: i - 1,
        mipLevelCount: 1,
      });
      const dstView = imageTexture.createView('sampled', {
        baseMipLevel: i,
        mipLevelCount: 1,
      });

      downsamplePipeline.withColorAttachment({
        view: root.unwrap(dstView),
        loadOp: 'clear',
        storeOp: 'store',
      }).with(
        downsampleLayout,
        root.createBindGroup(downsampleLayout, {
          source: sourceView,
        }),
      ).draw(3, 1, 0, 0);
      root['~unstable'].flush();

      srcWidth = dstWidth;
      srcHeight = dstHeight;
    }
  }

  generateMipmaps();

  return {
    texture: imageTexture,
    sampledView: imageTexture.createView('sampled'),
    sampler,
  };
}
