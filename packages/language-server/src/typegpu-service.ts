import type { LanguageServicePlugin } from '@volar/language-service';

export const typeGpuService = {
  name: 'typegpu-service',
  capabilities: {
    hoverProvider: true,
  },
  create(context) {
    return {
      provideHover(document, position, token) {
        console.log('Hovering...');
        return { contents: ['Example info'] };
      },
    };
  },
} satisfies LanguageServicePlugin;
