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

export function useLayout(): {
  def: LayoutDef;
  addElement: AddElement;
  setRef: (index: number, element: unknown) => void;
} {
  const [def, setDef] = useState<LayoutDef>({ elements: [] });
  const elementResolves = useRef(new Map<number, (element: unknown) => void>());

  const addElement: AddElement = useEvent(
    (type: CanvasDef['type'], options: Omit<CanvasDef, 'type'>) => {
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

  const setRef = useCallback((index: number, element: unknown) => {
    const resolve = elementResolves.current.get(index);
    if (!resolve) {
      throw new Error(`Tried to resolve non-existent layout element`);
    }
    resolve(element);
  }, []);

  return {
    def,
    addElement,
    setRef,
  };
}
