// Static server for manual testing: this directory at / (e.g. /dist/baseline/...), docs public assets at /TypeGPU/
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const here = import.meta.dirname;
const docsPublic = join(here, '../typegpu-docs/public');
const types: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  const path = url.startsWith('/TypeGPU/')
    ? join(docsPublic, normalize(url.slice('/TypeGPU/'.length)))
    : join(here, normalize(url.endsWith('/') ? `${url}index.html` : url));
  try {
    let data: Buffer | string = await readFile(path);
    if (extname(path) === '.html') {
      // Records the size of every shader module, to measure WGSL minification
      data = `<script>window.__wgsl=[];const o=GPUDevice.prototype.createShaderModule;GPUDevice.prototype.createShaderModule=function(d){window.__wgsl.push(d.code.length);(window.__wgslCode??=[]).push(d.code);return o.call(this,d)}</script>${data}`;
    }
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
}).listen(Number(process.env.PORT ?? 4789));
