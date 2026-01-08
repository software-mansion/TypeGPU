import { sdBox2d, sdDisk } from '@typegpu/sdf';
import type { AnySceneElement } from './scene.ts';
import { sceneElements } from './scene.ts';
import * as d from 'typegpu/data';

export interface DragTarget {
  id: string;
  element: AnySceneElement;
}

export class DragController {
  private isDragging = false;
  private draggedElement: DragTarget | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private onDragMove: (id: string, position: d.v2f) => void,
    private onDragEnd: (id: string, position: d.v2f) => void,
  ) {
    this.setupEventListeners();
  }

  private canvasToUV(clientX: number, clientY: number): d.v2f {
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    return d.vec2f(x, y);
  }

  private hitTestDisk(uv: d.v2f, center: d.v2f, radius: number): boolean {
    const dist = sdDisk(uv.sub(center), radius);
    return dist <= radius;
  }

  private hitTestBox(uv: d.v2f, center: d.v2f, size: d.v2f): boolean {
    const dist = sdBox2d(uv.sub(center), size.mul(1));
    return dist <= 0;
  }

  private hitTest(clientX: number, clientY: number): DragTarget | null {
    const uv = this.canvasToUV(clientX, clientY);

    for (const element of sceneElements) {
      let hit = false;

      if (element.type === 'disk') {
        const radius = element.size as number;
        hit = this.hitTestDisk(uv, element.position, radius);
      } else if (element.type === 'box') {
        const size = element.size as d.v2f;
        hit = this.hitTestBox(uv, element.position, size);
      }

      if (hit) {
        return { id: element.id, element };
      }
    }

    return null;
  }

  private setupEventListeners() {
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('mouseleave', this.onMouseLeave);
  }

  private onMouseDown = (e: MouseEvent) => {
    const target = this.hitTest(e.clientX, e.clientY);
    if (target) {
      this.isDragging = true;
      this.draggedElement = target;
      this.canvas.style.cursor = 'grabbing';
    }
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.isDragging || !this.draggedElement) {
      const target = this.hitTest(e.clientX, e.clientY);
      this.canvas.style.cursor = target ? 'grab' : 'default';
      return;
    }

    const newPos = this.canvasToUV(e.clientX, e.clientY);
    this.onDragMove(this.draggedElement.id, newPos);
  };

  private onMouseUp = (e: MouseEvent) => {
    if (this.isDragging && this.draggedElement) {
      const finalPos = this.canvasToUV(e.clientX, e.clientY);
      this.onDragEnd(this.draggedElement.id, finalPos);
      this.isDragging = false;
      this.draggedElement = null;

      const target = this.hitTest(e.clientX, e.clientY);
      this.canvas.style.cursor = target ? 'grab' : 'default';
    }
  };

  private onMouseLeave = () => {
    if (this.isDragging) {
      this.isDragging = false;
      this.draggedElement = null;
      this.canvas.style.cursor = 'default';
    }
  };

  destroy() {
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
  }
}
