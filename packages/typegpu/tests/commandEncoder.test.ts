import { describe, expect, type Mock, vi } from 'vitest';
import { Void } from 'typegpu/data';
import { tgpu, d, type TgpuRoot } from 'typegpu';
import { it } from 'typegpu-testing-utility';

function passDescriptor(beginRenderPass: Mock, index = 0): GPURenderPassDescriptor {
  return (beginRenderPass.mock.calls[index] as unknown[])?.[0] as GPURenderPassDescriptor;
}

describe('TgpuCommandEncoder', () => {
  const layout = tgpu.bindGroupLayout({ foo: { uniform: d.f32 } });

  const mainVertex = tgpu.vertexFn({
    out: { pos: d.builtin.position },
  })(() => {
    layout.$.foo;
    return { pos: d.vec4f() };
  });

  const mainFragment = tgpu.fragmentFn({ out: Void })(() => {});

  const plainVertex = tgpu.vertexFn({
    out: { pos: d.builtin.position },
  })(() => {
    return { pos: d.vec4f() };
  });

  const secondLayout = tgpu.bindGroupLayout({ bar: { uniform: d.f32 } });

  const secondVertex = tgpu.vertexFn({
    out: { pos: d.builtin.position },
  })(() => {
    secondLayout.$.bar;
    return { pos: d.vec4f() };
  });

  it('submits a single command buffer for multiple draws', ({ root, renderPassEncoder }) => {
    const group = root.createBindGroup(layout, {
      foo: root.createBuffer(d.f32).$usage('uniform'),
    });

    const pipeline = root
      .createRenderPipeline({ vertex: mainVertex, fragment: mainFragment })
      .with(group);

    const encoder = root.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [] });
    pipeline.with(pass).draw(3);
    pipeline.with(pass).draw(6, 2);
    pass.end();
    encoder.submit();

    expect(root.device.createCommandEncoder).toBeCalledTimes(1);
    expect(root.device.queue.submit).toBeCalledTimes(1);
    expect(renderPassEncoder.draw).toBeCalledTimes(2);
    expect(renderPassEncoder.end).toBeCalledTimes(1);
  });

  it('applies pipeline state once for consecutive draws with the same pipeline', ({
    root,
    renderPassEncoder,
  }) => {
    const group = root.createBindGroup(layout, {
      foo: root.createBuffer(d.f32).$usage('uniform'),
    });

    const pipeline = root
      .createRenderPipeline({ vertex: mainVertex, fragment: mainFragment })
      .with(group);

    const encoder = root.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [] });
    const bound = pipeline.with(pass);
    bound.draw(3);
    bound.draw(3);
    bound.draw(3);
    pass.end();
    encoder.submit();

    expect(renderPassEncoder.setPipeline).toBeCalledTimes(1);
    expect(renderPassEncoder.setBindGroup).toBeCalledTimes(1);
    expect(renderPassEncoder.draw).toBeCalledTimes(3);
  });

  it('re-applies pipeline state after another pipeline drew', ({ root, renderPassEncoder }) => {
    const group = root.createBindGroup(layout, {
      foo: root.createBuffer(d.f32).$usage('uniform'),
    });
    const secondGroup = root.createBindGroup(secondLayout, {
      bar: root.createBuffer(d.f32).$usage('uniform'),
    });

    const first = root
      .createRenderPipeline({ vertex: mainVertex, fragment: mainFragment })
      .with(group);
    const second = root
      .createRenderPipeline({ vertex: secondVertex, fragment: mainFragment })
      .with(secondGroup);

    const encoder = root.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [] });
    first.with(pass).draw(3);
    second.with(pass).draw(3);
    first.with(pass).draw(3);
    pass.end();
    encoder.submit();

    expect(renderPassEncoder.setPipeline).toBeCalledTimes(3);
  });

  it('re-applies pipeline state after pass-level setBindGroup', ({ root, renderPassEncoder }) => {
    const groupA = root.createBindGroup(layout, {
      foo: root.createBuffer(d.f32).$usage('uniform'),
    });
    const groupB = root.createBindGroup(layout, {
      foo: root.createBuffer(d.f32).$usage('uniform'),
    });

    const pipeline = root.createRenderPipeline({
      vertex: mainVertex,
      fragment: mainFragment,
    });

    const encoder = root.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [] });
    pass.setBindGroup(groupA);
    const bound = pipeline.with(pass);
    bound.draw(3);
    pass.setBindGroup(groupB);
    bound.draw(3);
    pass.end();
    encoder.submit();

    expect(renderPassEncoder.setPipeline).toBeCalledTimes(2);
    expect(renderPassEncoder.setBindGroup).nthCalledWith(1, 0, root.unwrap(groupA));
    expect(renderPassEncoder.setBindGroup).nthCalledWith(2, 0, root.unwrap(groupB));
  });

  it('prefers pipeline-level bind groups over pass-level ones', ({ root, renderPassEncoder }) => {
    const passGroup = root.createBindGroup(layout, {
      foo: root.createBuffer(d.f32).$usage('uniform'),
    });
    const pipelineGroup = root.createBindGroup(layout, {
      foo: root.createBuffer(d.f32).$usage('uniform'),
    });

    const pipeline = root
      .createRenderPipeline({ vertex: mainVertex, fragment: mainFragment })
      .with(pipelineGroup);

    const encoder = root.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [] });
    pass.setBindGroup(passGroup);
    pipeline.with(pass).draw(3);
    pass.end();
    encoder.submit();

    expect(renderPassEncoder.setBindGroup).toBeCalledTimes(1);
    expect(renderPassEncoder.setBindGroup).toBeCalledWith(0, root.unwrap(pipelineGroup));
  });

  it('applies a prepared index buffer when drawing proxy-style', ({ root, renderPassEncoder }) => {
    const indexBuffer = root.createBuffer(d.arrayOf(d.u16, 4)).$usage('index');
    const pipeline = root
      .createRenderPipeline({ vertex: plainVertex, fragment: mainFragment })
      .withIndexBuffer(indexBuffer);

    const encoder = root.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [] });
    pass.setPipeline(pipeline);
    pass.drawIndexed(3);
    pass.end();
    encoder.submit();

    expect(renderPassEncoder.setIndexBuffer).toBeCalledTimes(1);
    expect(renderPassEncoder.setIndexBuffer).toBeCalledWith(
      root.unwrap(indexBuffer),
      'uint16',
      undefined,
      undefined,
    );
    expect(renderPassEncoder.drawIndexed).toBeCalledTimes(1);
  });

  it('restores the pass-level index buffer after a pipeline override', ({
    root,
    renderPassEncoder,
  }) => {
    const passIndexBuffer = root.createBuffer(d.arrayOf(d.u16, 4)).$usage('index');
    const pipelineIndexBuffer = root.createBuffer(d.arrayOf(d.u16, 4)).$usage('index');

    const plain = root.createRenderPipeline({ vertex: plainVertex, fragment: mainFragment });
    const prepared = plain.withIndexBuffer(pipelineIndexBuffer);

    const encoder = root.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [] });
    pass.setIndexBuffer(passIndexBuffer, 'uint16');
    prepared.with(pass).drawIndexed(3);
    pass.setPipeline(plain);
    pass.drawIndexed(3);
    pass.end();
    encoder.submit();

    expect(renderPassEncoder.setIndexBuffer).nthCalledWith(
      1,
      root.unwrap(pipelineIndexBuffer),
      'uint16',
      undefined,
      undefined,
    );
    expect(renderPassEncoder.setIndexBuffer).nthCalledWith(
      2,
      root.unwrap(passIndexBuffer),
      'uint16',
      undefined,
      undefined,
    );
    expect(renderPassEncoder.setStencilReference).not.toBeCalled();
  });

  it('prefers a pipeline stencil reference and falls back to pass state', ({
    root,
    renderPassEncoder,
  }) => {
    const plain = root.createRenderPipeline({ vertex: plainVertex, fragment: mainFragment });
    const withRef = plain.withStencilReference(5);

    const encoder = root.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [] });
    pass.setStencilReference(7);
    withRef.with(pass).draw(3);
    plain.with(pass).draw(3);
    pass.setStencilReference(2);
    plain.with(pass).draw(3);
    pass.end();
    encoder.submit();

    // Pass-level references apply eagerly; pipeline-level ones override at
    // draw time and the pass state is restored for the next pipeline
    expect(renderPassEncoder.setStencilReference).toBeCalledTimes(4);
    expect(renderPassEncoder.setStencilReference).nthCalledWith(1, 7);
    expect(renderPassEncoder.setStencilReference).nthCalledWith(2, 5);
    expect(renderPassEncoder.setStencilReference).nthCalledWith(3, 7);
    expect(renderPassEncoder.setStencilReference).nthCalledWith(4, 2);
  });

  it('resets a pipeline stencil reference for the next pipeline', ({ root, renderPassEncoder }) => {
    const plain = root.createRenderPipeline({ vertex: plainVertex, fragment: mainFragment });
    const withRef = plain.withStencilReference(5);

    const encoder = root.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [] });
    withRef.with(pass).draw(3);
    plain.with(pass).draw(3);
    pass.end();
    encoder.submit();

    expect(renderPassEncoder.setStencilReference).nthCalledWith(1, 5);
    expect(renderPassEncoder.setStencilReference).nthCalledWith(2, 0);
  });

  it('disables state deduplication after the pass is unwrapped', ({ root, renderPassEncoder }) => {
    const pipeline = root.createRenderPipeline({ vertex: plainVertex, fragment: mainFragment });

    const encoder = root.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [] });
    const bound = pipeline.with(pass);
    bound.draw(3);
    bound.draw(3);
    root.unwrap(pass);
    bound.draw(3);
    bound.draw(3);
    pass.end();
    encoder.submit();

    expect(renderPassEncoder.setPipeline).toBeCalledTimes(3);
  });

  it('resets applied state after executeBundles', ({ root, renderPassEncoder }) => {
    const group = root.createBindGroup(layout, {
      foo: root.createBuffer(d.f32).$usage('uniform'),
    });

    const pipeline = root
      .createRenderPipeline({ vertex: mainVertex, fragment: mainFragment })
      .with(group);

    const encoder = root.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [] });
    const bound = pipeline.with(pass);
    bound.draw(3);
    pass.executeBundles([]);
    bound.draw(3);
    pass.end();
    encoder.submit();

    expect(renderPassEncoder.setPipeline).toBeCalledTimes(2);
  });

  it('throws when drawing without a pipeline', ({ root }) => {
    const encoder = root.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [] });

    expect(() => pass.draw(3)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot draw without a call to pass.setPipeline]`,
    );
  });

  it('throws when a used bind group is missing', ({ root }) => {
    const pipeline = root.createRenderPipeline({
      vertex: mainVertex,
      fragment: mainFragment,
    });

    const encoder = root.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [] });

    expect(() => pipeline.with(pass).draw(3)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Missing bind groups for layouts: 'layout'. Please provide it using pipeline.with(bindGroup).(...)]`,
    );
  });

  it('unwraps to raw WebGPU objects', ({ root, commandEncoder, renderPassEncoder }) => {
    const encoder = root.createCommandEncoder();
    const renderPass = encoder.beginRenderPass({ colorAttachments: [] });
    const computePass = encoder.beginComputePass();

    expect(root.unwrap(encoder)).toBe(commandEncoder);
    expect(root.unwrap(renderPass)).toBe(renderPassEncoder);
    expect(root.unwrap(computePass)).toBe(
      commandEncoder.mock.beginComputePass.mock.results[0]?.value,
    );
  });

  describe('pass descriptor', () => {
    it('unwraps TypeGPU textures passed as attachment views', ({ root, commandEncoder }) => {
      const colorTexture = root
        .createTexture({ size: [64, 64], format: 'rgba8unorm' })
        .$usage('render');
      const depthTexture = root
        .createTexture({ size: [64, 64], format: 'depth24plus' })
        .$usage('render');

      const encoder = root.createCommandEncoder();
      encoder.beginRenderPass({
        colorAttachments: [{ view: colorTexture }],
        depthStencilAttachment: { view: depthTexture },
      });

      expect(root.unwrap(colorTexture).createView).toBeCalled();
      expect(root.unwrap(depthTexture).createView).toBeCalled();

      const descriptor = passDescriptor(commandEncoder.mock.beginRenderPass);
      const [colorAttachment] = [...descriptor.colorAttachments];
      expect(colorAttachment).toMatchInlineSnapshot(`
        {
          "loadOp": "clear",
          "storeOp": "store",
          "view": {
            "label": "",
          },
        }
      `);
      expect(descriptor.depthStencilAttachment).toMatchInlineSnapshot(`
        {
          "depthClearValue": 1,
          "depthLoadOp": "clear",
          "depthStoreOp": "store",
          "view": {
            "label": "",
          },
        }
      `);
    });

    it('normalizes color attachments', ({ root, commandEncoder }) => {
      const colorTexture = root
        .createTexture({ size: [64, 64], format: 'rgba8unorm' })
        .$usage('render');
      const depthTexture = root
        .createTexture({ size: [64, 64], format: 'depth24plus' })
        .$usage('render');

      const encoder = root.createCommandEncoder();
      encoder.beginRenderPass({ depthStencilAttachment: { view: depthTexture } });
      encoder.beginRenderPass({ colorAttachments: { view: colorTexture } });

      const omitted = passDescriptor(commandEncoder.mock.beginRenderPass, 0);
      const single = passDescriptor(commandEncoder.mock.beginRenderPass, 1);
      expect([...omitted.colorAttachments]).toHaveLength(0);
      expect([...single.colorAttachments]).toHaveLength(1);
    });

    it('does not apply depth defaults to read-only depth attachments', ({
      root,
      commandEncoder,
    }) => {
      const depthTexture = root
        .createTexture({ size: [64, 64], format: 'depth24plus' })
        .$usage('render');

      const encoder = root.createCommandEncoder();
      encoder.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: { view: depthTexture, depthReadOnly: true },
      });

      expect(passDescriptor(commandEncoder.mock.beginRenderPass).depthStencilAttachment)
        .toMatchInlineSnapshot(`
        {
          "depthReadOnly": true,
          "view": {
            "label": "",
          },
        }
      `);
    });

    it('applies stencil defaults only for formats with a stencil aspect', ({
      root,
      commandEncoder,
    }) => {
      const depthStencilTexture = root
        .createTexture({ size: [64, 64], format: 'depth24plus-stencil8' })
        .$usage('render');

      const encoder = root.createCommandEncoder();
      encoder.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: { view: depthStencilTexture },
      });

      expect(passDescriptor(commandEncoder.mock.beginRenderPass).depthStencilAttachment)
        .toMatchInlineSnapshot(`
        {
          "depthClearValue": 1,
          "depthLoadOp": "clear",
          "depthStoreOp": "store",
          "stencilLoadOp": "clear",
          "stencilStoreOp": "store",
          "view": {
            "label": "",
          },
        }
      `);
    });

    it('derives depth/stencil defaults from the aspect of a TypeGPU view', ({
      root,
      commandEncoder,
    }) => {
      const depthStencilTexture = root
        .createTexture({ size: [64, 64], format: 'depth24plus-stencil8' })
        .$usage('render');

      const encoder = root.createCommandEncoder();
      encoder.beginRenderPass({
        depthStencilAttachment: { view: depthStencilTexture.createView('render') },
      });
      encoder.beginRenderPass({
        depthStencilAttachment: {
          view: depthStencilTexture.createView('render', { aspect: 'depth-only' }),
        },
      });

      const bothAspects = passDescriptor(commandEncoder.mock.beginRenderPass, 0);
      const depthOnly = passDescriptor(commandEncoder.mock.beginRenderPass, 1);
      expect(bothAspects.depthStencilAttachment).toMatchInlineSnapshot(`
        {
          "depthClearValue": 1,
          "depthLoadOp": "clear",
          "depthStoreOp": "store",
          "stencilLoadOp": "clear",
          "stencilStoreOp": "store",
          "view": {
            "label": "<unnamed>",
          },
        }
      `);
      expect(depthOnly.depthStencilAttachment).toMatchInlineSnapshot(`
        {
          "depthClearValue": 1,
          "depthLoadOp": "clear",
          "depthStoreOp": "store",
          "view": {
            "label": "<unnamed>",
          },
        }
      `);
    });

    it('defaults raw views all-or-nothing', ({ root, commandEncoder }) => {
      const encoder = root.createCommandEncoder();
      encoder.beginRenderPass({
        depthStencilAttachment: { view: {} as GPUTextureView },
      });
      encoder.beginRenderPass({
        depthStencilAttachment: {
          view: {} as GPUTextureView,
          stencilLoadOp: 'clear',
          stencilStoreOp: 'store',
        },
      });

      const noOps = passDescriptor(commandEncoder.mock.beginRenderPass, 0);
      const explicitOps = passDescriptor(commandEncoder.mock.beginRenderPass, 1);
      expect(noOps.depthStencilAttachment).toMatchInlineSnapshot(`
        {
          "depthClearValue": 1,
          "depthLoadOp": "clear",
          "depthStoreOp": "store",
          "view": {},
        }
      `);
      expect(explicitOps.depthStencilAttachment).toMatchInlineSnapshot(`
        {
          "stencilLoadOp": "clear",
          "stencilStoreOp": "store",
          "view": {},
        }
      `);
    });
  });

  describe('ignored pipeline priors', () => {
    const colorFragment = tgpu.fragmentFn({ out: { color: d.vec4f } })('');

    function colorPipeline(root: TgpuRoot) {
      return root.createRenderPipeline({
        vertex: plainVertex,
        fragment: colorFragment,
        targets: { color: { format: 'rgba8unorm' } },
      });
    }

    it('warns once that pipeline attachments are dropped when drawing into a pass', ({ root }) => {
      using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const pipeline = colorPipeline(root)
        .withColorAttachment({ color: { view: {} as unknown as GPUTextureView } })
        .withDepthStencilAttachment({ view: {} as unknown as GPUTextureView });

      const encoder = root.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [] });
      pipeline.with(pass).draw(3);
      pipeline.with(pass).draw(3);
      pass.end();
      encoder.submit();

      expect(consoleWarnSpy).toBeCalledTimes(1);
      expect(consoleWarnSpy.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"Pipeline-level attachments are ignored when drawing into a render pass. Pass \`colorAttachments\` and \`depthStencilAttachment\` to encoder.beginRenderPass instead."`,
      );
    });

    it('does not warn when the pipeline begins its own pass', ({ root }) => {
      using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const pipeline = colorPipeline(root).withColorAttachment({
        color: { view: {} as unknown as GPUTextureView },
      });

      const encoder = root.createCommandEncoder();
      pipeline.with(encoder).draw(3);
      encoder.submit();

      expect(consoleWarnSpy).not.toBeCalled();
    });
  });

  describe('compute pass', () => {
    const computeLayout = tgpu.bindGroupLayout({ data: { uniform: d.f32 } });

    const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
      computeLayout.$.data;
    });

    it('dispatches into a shared pass without submitting', ({ root, commandEncoder }) => {
      const group = root.createBindGroup(computeLayout, {
        data: root.createBuffer(d.f32).$usage('uniform'),
      });

      const pipeline = root.createComputePipeline({ compute: entry }).with(group);

      const encoder = root.createCommandEncoder();
      const pass = encoder.beginComputePass();
      const bound = pipeline.with(pass);
      bound.dispatchWorkgroups(1);
      bound.dispatchWorkgroups(2);
      pass.end();
      encoder.submit();

      expect(root.device.queue.submit).toBeCalledTimes(1);

      const computePassMock = commandEncoder.mock.beginComputePass.mock.results[0]?.value as {
        setPipeline: unknown;
        dispatchWorkgroups: unknown;
        end: unknown;
      };
      expect(computePassMock.setPipeline).toBeCalledTimes(1);
      expect(computePassMock.dispatchWorkgroups).toBeCalledTimes(2);
      expect(computePassMock.end).toBeCalledTimes(1);
    });

    it('throws when dispatching without a pipeline', ({ root }) => {
      const encoder = root.createCommandEncoder();
      const pass = encoder.beginComputePass();

      expect(() => pass.dispatchWorkgroups(1)).toThrowErrorMatchingInlineSnapshot(
        `[Error: Cannot dispatch without a call to pass.setPipeline]`,
      );
    });

    it('mixes render and compute passes in one encoder', ({ root, commandEncoder }) => {
      const group = root.createBindGroup(computeLayout, {
        data: root.createBuffer(d.f32).$usage('uniform'),
      });
      const renderGroup = root.createBindGroup(layout, {
        foo: root.createBuffer(d.f32).$usage('uniform'),
      });

      const computePipeline = root.createComputePipeline({ compute: entry }).with(group);
      const renderPipeline = root
        .createRenderPipeline({ vertex: mainVertex, fragment: mainFragment })
        .with(renderGroup);

      const encoder = root.createCommandEncoder();

      const computePass = encoder.beginComputePass();
      computePipeline.with(computePass).dispatchWorkgroups(1);
      computePass.end();

      const renderPass = encoder.beginRenderPass({ colorAttachments: [] });
      renderPipeline.with(renderPass).draw(3);
      renderPass.end();

      encoder.submit();

      expect(root.device.createCommandEncoder).toBeCalledTimes(1);
      expect(root.device.queue.submit).toBeCalledTimes(1);
      expect(commandEncoder.mock.beginComputePass).toBeCalledTimes(1);
      expect(commandEncoder.mock.beginRenderPass).toBeCalledTimes(1);
    });
  });
});
