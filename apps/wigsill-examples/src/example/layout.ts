import type {
  AddElement,
  ElementDef,
  ElementOptions,
  ElementType,
  LayoutDef,
  TableRef,
} from '@wigsill/example-toolkit';
import { useCallback, useRef, useState } from 'react';
import { ExecutionCancelledError } from './errors';

/**
 * One per example instance.
 */
export type LayoutInstance = {
  addElement: AddElement;
  dispose: () => void;
  resolveElement: (key: string, element: unknown) => void;
};

const uniqueElementKey = (() => {
  let nextFreeElementKey = 1;

  return () => `${nextFreeElementKey++}`;
})();

const makeLayout = (appendToDef: (element: ElementDef) => void) => {
  const elementResolves = new Map<string, (element: unknown) => void>();
  const elementRejects: ((err: unknown) => void)[] = [];

  let cancelled = false;

  const newInstance: LayoutInstance = {
    addElement: (<T extends ElementType>(
      type: T,
      options?: ElementOptions<T>,
    ) => {
      if (cancelled) {
        throw new ExecutionCancelledError();
      }

      const elementKey = uniqueElementKey();

      if (type === 'canvas') {
        appendToDef({ ...options, type: 'canvas', key: elementKey });

        return new Promise<HTMLCanvasElement>((resolve, reject) => {
          elementResolves.set(elementKey, resolve as () => void);
          elementRejects.push(reject);
        });
      }

      if (type === 'video') {
        appendToDef({ ...options, type: 'video', key: elementKey });

        return new Promise<HTMLVideoElement>((resolve, reject) => {
          elementResolves.set(elementKey, resolve as () => void);
          elementRejects.push(reject);
        });
      }

      if (type === 'table') {
        appendToDef({ ...options, type: 'table', key: elementKey });

        return new Promise<TableRef>((resolve, reject) => {
          elementResolves.set(elementKey, resolve as () => void);
          elementRejects.push(reject);
        });
      }

      throw new Error(`Tried to add unsupported layout element: ${type}`);
    }) as AddElement,

    dispose: () => {
      cancelled = true;
      elementResolves.clear();
      for (const reject of elementRejects) {
        reject(new ExecutionCancelledError());
      }
    },

    resolveElement(key, element) {
      if (cancelled) {
        // Happens in the React UI loop, ignore instead of throwing an error.
        return;
      }

      const resolve = elementResolves.get(key);
      if (resolve) {
        resolve(element);
      }
    },
  };

  return newInstance;
};

export function useLayout(): {
  def: LayoutDef;
  createLayout: () => LayoutInstance;
  dispose: () => void;
  setRef: (key: string, element: unknown) => void;
} {
  const [layoutDef, setLayoutDef] = useState<LayoutDef>({ elements: [] });
  const instanceRef = useRef<LayoutInstance | null>(null);

  const dispose = useCallback(() => {
    if (!instanceRef.current) {
      return;
    }

    instanceRef.current.dispose();
    instanceRef.current = null;
  }, []);

  const createLayout = useCallback(() => {
    // Discarding the old one, if it still exists.
    dispose();

    setLayoutDef({ elements: [] });

    const newInstance = makeLayout((value: ElementDef) =>
      setLayoutDef((prev) => ({
        elements: [...prev.elements, value],
      })),
    );

    instanceRef.current = newInstance;
    return newInstance;
  }, [dispose]);

  const setRef = useCallback((key: string, element: unknown) => {
    if (!instanceRef.current) {
      throw new Error('No layout is currently active');
    }

    instanceRef.current.resolveElement(key, element);
  }, []);

  return {
    def: layoutDef,
    dispose,
    createLayout,
    setRef,
  };
}
