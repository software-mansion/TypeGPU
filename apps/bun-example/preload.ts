import { plugin } from 'bun';
import typegpu from 'unplugin-typegpu/bun';

void plugin(typegpu({ include: /\.(ts)$/ }));
