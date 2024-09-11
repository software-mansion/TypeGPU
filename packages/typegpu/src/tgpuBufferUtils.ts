import { BufferReader, BufferWriter, type Parsed } from 'typed-binary';
import type { TgpuBuffer, Unmanaged } from './tgpuBuffer';
import type { AnyTgpuData } from './types';

export function write<TData extends AnyTgpuData>(
  buffer: TgpuBuffer<TData> & Unmanaged,
  data: Parsed<TData>,
): void {
  const gpuBuffer = buffer.buffer;
  const device = buffer.device;

  if (gpuBuffer.mapState === 'mapped') {
    const mapped = gpuBuffer.getMappedRange();
    buffer.dataType.write(new BufferWriter(mapped), data);
    return;
  }

  const size = buffer.dataType.size;
  const hostBuffer = new ArrayBuffer(size);
  buffer.dataType.write(new BufferWriter(hostBuffer), data);
  device.queue.writeBuffer(gpuBuffer, 0, hostBuffer, 0, size);
}

export async function read<TData extends AnyTgpuData>(
  buffer: TgpuBuffer<TData> & Unmanaged,
): Promise<Parsed<TData>> {
  const gpuBuffer = buffer.buffer;
  const device = buffer.device;

  if (gpuBuffer.mapState === 'mapped') {
    const mapped = gpuBuffer.getMappedRange();
    const res = buffer.dataType.read(new BufferReader(mapped)) as Parsed<TData>;
    return res;
  }

  if (gpuBuffer.usage & GPUBufferUsage.MAP_READ) {
    await gpuBuffer.mapAsync(GPUMapMode.READ);
    const mapped = gpuBuffer.getMappedRange();
    const res = buffer.dataType.read(new BufferReader(mapped)) as Parsed<TData>;
    gpuBuffer.unmap();
    return res;
  }

  const stagingBuffer = device.createBuffer({
    size: buffer.dataType.size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const commandEncoder = device.createCommandEncoder();
  commandEncoder.copyBufferToBuffer(
    gpuBuffer,
    0,
    stagingBuffer,
    0,
    buffer.dataType.size,
  );

  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  await stagingBuffer.mapAsync(GPUMapMode.READ, 0, buffer.dataType.size);

  const res = buffer.dataType.read(
    new BufferReader(stagingBuffer.getMappedRange()),
  ) as Parsed<TData>;

  stagingBuffer.unmap();
  stagingBuffer.destroy();

  return res;
}
