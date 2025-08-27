import type { SessionOptions, ValueMetadata } from './utils.ts';
import { InferenceSessionClass } from './inferenceSession.ts';

export class OnnxModelLoader {
  #inferenceSession: InferenceSessionClass;

  readonly inputNames: string[] = [];
  readonly outputNames: string[] = [];

  readonly inputMetadata: ValueMetadata[] = [];
  readonly outputMetadata: ValueMetadata[] = [];

  constructor(
    pathOrBuffer: string | Uint8Array,
    options: SessionOptions,
  ) {
    this.#inferenceSession = new InferenceSessionClass();
    // loadModel is async to support both Node fs and browser fetch semantics
    const session = this.#inferenceSession;
    (async () => {
      if (typeof pathOrBuffer === 'string') {
        await session.loadModel(pathOrBuffer, options);
      } else {
        await session.loadModel(
          pathOrBuffer,
          pathOrBuffer.byteOffset,
          pathOrBuffer.byteLength,
          options,
        );
      }

      console.log('ONNX model loaded');
      console.log('Input:', session._modelBuffer);
    })();

    // const fillNamesAndMetadata = (
    //   // this function takes raw metadata from binding and returns a tuple of the following 2 items:
    //   // - an array of string representing names
    //   // - an array of converted InferenceSession.ValueMetadata
    //   rawMetadata: readonly ValueMetadata[],
    // ): [names: string[], metadata: ValueMetadata[]] => {
    //   const names: string[] = [];
    //   const metadata: ValueMetadata[] = [];

    //   for (const m of rawMetadata) {
    //     names.push(m.name);
    //     if (!m.isTensor) {
    //       metadata.push({ name: m.name, isTensor: false });
    //     } else {
    //       const type = dataTypeStrings[m.type];
    //       if (type === undefined) {
    //         throw new Error(`Unsupported data type: ${m.type}`);
    //       }
    //       const shape: Array<number | string> = [];
    //       for (let i = 0; i < m.shape!.length; ++i) {
    //         const dim = m.shape![i];
    //         if (dim === -1) {
    //           shape.push(m.symbolicDimensions[i]);
    //         } else if (dim as number >= 0) {
    //           shape.push(dim!);
    //         } else {
    //           throw new Error(`Invalid dimension: ${dim}`);
    //         }
    //       }
    //       metadata.push({
    //         name: m.name,
    //         isTensor: m.isTensor,
    //         type,
    //         shape,
    //       });
    //     }
    //   }

    //   return [names, metadata];
    // };

    // [this.inputNames, this.inputMetadata] = fillNamesAndMetadata(
    //   this.#inferenceSession.inputMetadata,
    // );
    // [this.outputNames, this.outputMetadata] = fillNamesAndMetadata(
    //   this.#inferenceSession.outputMetadata,
    // );
  }

}
