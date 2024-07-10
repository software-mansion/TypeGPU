import { useCallback, useRef, useState } from 'react';
import useEvent from '../common/useEvent';

export type CanvasDef = {
  type: 'canvas';
  width?: number;
  height?: number;
};

export type LayoutDef = {
  elements: CanvasDef[];
};

export type AddElement = (
  type: 'canvas',
  options: Omit<CanvasDef, 'type'>,
) => Promise<HTMLElement>;

/**
 * One per example instance.
 */
export type LayoutInstance = {
  addElement: AddElement;
  active: boolean;
  dispose: () => void;
};

export function useLayout(): {
  def: LayoutDef;
  createLayout: () => LayoutInstance;
  dispose: () => void;
  setRef: (index: number, element: unknown) => void;
} {
  const [def, setDef] = useState<LayoutDef>({ elements: [] });
  const elementResolves = useRef(new Map<number, (element: unknown) => void>());
  const instanceRef = useRef<LayoutInstance | null>(null);

  const addElement: AddElement = useEvent(
    (type: CanvasDef['type'], options: Omit<CanvasDef, 'type'>) => {
      if (!instanceRef.current) {
        // No instance is active.
        throw new Error(`No layout is active`);
      }

      const index = def.elements.length;

      if (type === 'canvas') {
        setDef({
          elements: [...def.elements, { ...options, type: 'canvas' }],
        });

        return new Promise<HTMLCanvasElement>((resolve) => {
          elementResolves.current.set(index, resolve as () => void);
        });
      } else {
        throw new Error(`Tried to add unsupported layout element: ${type}`);
      }
    },
  );

  const dispose = useCallback(() => {
    if (!instanceRef.current) {
      return;
    }

    instanceRef.current.active = false;
    instanceRef.current = null;
  }, []);

  const createLayout = useCallback(() => {
    // Discarding the old one, if it still exists.
    dispose();

    setDef({ elements: [] });

    const newInstance: LayoutInstance = {
      active: true,
      addElement,
      dispose,
    };

    instanceRef.current = newInstance;
    return newInstance;
  }, [dispose, addElement]);

  const setRef = useCallback((index: number, element: unknown) => {
    const resolve = elementResolves.current.get(index);
    if (!resolve) {
      throw new Error(`Tried to resolve non-existent layout element`);
    }
    resolve(element);
  }, []);

  return {
    def,
    dispose,
    createLayout,
    setRef,
  };
}
