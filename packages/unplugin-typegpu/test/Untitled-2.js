import tgpu, { d } from 'typegpu';

const root = await tgpu.init();
const buffers = { buf: root.createMutable(d.struct({ pos: d.vec2u })) };

const fn1 = () => {
  'use gpu';
  const x = buffers.buf.$;
};
// externals: { 'buffers': { 'buf': { '$': () => buffers.buf.$ } } }
// ?? externals: { 'buffers': { 'buf': () => buffers.buf } } -- czemu cała ściezka? bo czemu nie
// ?? externals: { 'buffers': { 'buf': { '$' : buffers.buf.$ } } } -- czemu '() => '? comptime .$
// ?? externals: { 'buffers.buf.$': () => buffers.buf.$ } } -- czemu nie flattenujemy? jest na to issue
