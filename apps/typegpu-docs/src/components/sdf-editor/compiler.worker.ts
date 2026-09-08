import { compileScene } from './compileScene.ts';
export type SceneResponse = { code: string; error?: never } | { error: string; code?: never };
self.onmessage = (event: MessageEvent<string>) => {
  try {
    self.postMessage({ code: compileScene(event.data) } satisfies SceneResponse, []);
  } catch (error) {
    self.postMessage(
      { error: error instanceof Error ? error.message : String(error) } satisfies SceneResponse,
      [],
    );
  }
};
