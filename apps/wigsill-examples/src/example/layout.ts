import { useCallback, useMemo, useRef } from 'react';
import { atom, useAtomValue, useStore } from 'jotai';

import { ExecutionCancelledError } from './errors';

export type CanvasDef = {
  type: 'canvas';
  key: string;
  width?: number;
  height?: number;
};

export type VideoDef = {
  type: 'video';
  key: string;
  width?: number;
  height?: number;
};

export type ElementDef = CanvasDef | VideoDef;

export type ElementType = ElementDef['type'];
export type ElementOptions = Omit<ElementDef, 'type' | 'key'>;

export type LayoutDef = {
  elements: ElementDef[];
};

export type AddElement = (
  type: ElementType,
  options: ElementOptions,
) => Promise<HTMLElement>;

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
    addElement: (type: ElementType, options: ElementOptions) => {
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
      } else if (type === 'video') {
        appendToDef({ ...options, type: 'video', key: elementKey });

        return new Promise<HTMLVideoElement>((resolve, reject) => {
          elementResolves.set(elementKey, resolve as () => void);
          elementRejects.push(reject);
        });
      } else {
        throw new Error(`Tried to add unsupported layout element: ${type}`);
      }
    },

    dispose: () => {
      cancelled = true;
      elementResolves.clear();
      elementRejects.forEach((reject) => reject(new ExecutionCancelledError()));
    },

    resolveElement(key, element) {
      if (cancelled) {
        throw new ExecutionCancelledError();
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
  const store = useStore();
  const layoutDefAtom = useMemo(() => atom<LayoutDef>({ elements: [] }), []);
  const instanceRef = useRef<LayoutInstance | null>(null);
  const def = useAtomValue(layoutDefAtom);

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

    store.set(layoutDefAtom, { elements: [] });

    const newInstance = makeLayout((value: ElementDef) =>
      store.set(layoutDefAtom, (prev) => ({
        elements: [...prev.elements, value],
      })),
    );

    instanceRef.current = newInstance;
    return newInstance;
  }, [dispose, store, layoutDefAtom]);

  const setRef = useCallback((key: string, element: unknown) => {
    if (!instanceRef.current) {
      throw new Error(`No layout is currently active`);
    }

    instanceRef.current.resolveElement(key, element);
  }, []);

  return {
    def,
    dispose,
    createLayout,
    setRef,
  };
}
