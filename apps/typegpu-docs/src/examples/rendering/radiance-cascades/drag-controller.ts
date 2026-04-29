import { sdBox2d, sdDisk } from '@typegpu/sdf';
import type { AnySceneElement } from './scene.ts';
import { sceneElements } from './scene.ts';
import { d } from 'typegpu';

type DragTarget = AnySceneElement;

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
    return sdDisk(uv.sub(center), radius) <= 0;
  }

  private hitTestBox(uv: d.v2f, center: d.v2f, size: d.v2f): boolean {
    return sdBox2d(uv.sub(center), size) <= 0;
  }

  private hitTest(clientX: number, clientY: number): DragTarget | null {
    const uv = this.canvasToUV(clientX, clientY);
    for (const el of sceneElements) {
      const hit =
        el.type === 'disk'
          ? this.hitTestDisk(uv, el.position, el.size)
          : this.hitTestBox(uv, el.position, el.size);
      if (hit) {
        return el;
      }
    }
    return null;
  }

  private setupEventListeners() {
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this.onMouseLeave.bind(this));
    this.canvas.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
    this.canvas.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
    this.canvas.addEventListener('touchend', this.onTouchEnd.bind(this));
    this.canvas.addEventListener('touchcancel', this.onTouchEnd.bind(this));
  }

  private onMouseDown(e: MouseEvent) {
    const target = this.hitTest(e.clientX, e.clientY);
    if (target) {
      this.isDragging = true;
      this.draggedElement = target;
      this.canvas.style.cursor = 'grabbing';
    }
  }

  private onMouseMove(e: MouseEvent) {
    if (!this.isDragging || !this.draggedElement) {
      const target = this.hitTest(e.clientX, e.clientY);
      this.canvas.style.cursor = target ? 'grab' : 'default';
      return;
    }

    const newPos = this.canvasToUV(e.clientX, e.clientY);
    this.onDragMove(this.draggedElement.id, newPos);
  }

  private onMouseUp(e: MouseEvent) {
    if (this.isDragging && this.draggedElement) {
      const finalPos = this.canvasToUV(e.clientX, e.clientY);
      this.onDragEnd(this.draggedElement.id, finalPos);
      this.isDragging = false;
      this.draggedElement = null;

      const target = this.hitTest(e.clientX, e.clientY);
      this.canvas.style.cursor = target ? 'grab' : 'default';
    }
  }

  private onMouseLeave() {
    if (this.isDragging) {
      this.isDragging = false;
      this.draggedElement = null;
      this.canvas.style.cursor = 'default';
    }
  }

  private touchPoint(e: TouchEvent): Touch | null {
    return e.touches[0] ?? e.changedTouches[0] ?? null;
  }

  private onTouchStart(e: TouchEvent) {
    const touch = this.touchPoint(e);
    if (!touch) {
      return;
    }

    const target = this.hitTest(touch.clientX, touch.clientY);
    if (target) {
      e.preventDefault();
      this.isDragging = true;
      this.draggedElement = target;
    }
  }

  private onTouchMove(e: TouchEvent) {
    if (!this.isDragging || !this.draggedElement) {
      return;
    }

    const touch = this.touchPoint(e);
    if (!touch) {
      return;
    }

    e.preventDefault();
    const newPos = this.canvasToUV(touch.clientX, touch.clientY);
    this.onDragMove(this.draggedElement.id, newPos);
  }

  private onTouchEnd(e: TouchEvent) {
    if (!this.isDragging || !this.draggedElement) {
      return;
    }

    const touch = this.touchPoint(e);
    if (touch) {
      const finalPos = this.canvasToUV(touch.clientX, touch.clientY);
      this.onDragEnd(this.draggedElement.id, finalPos);
    }

    this.isDragging = false;
    this.draggedElement = null;
  }

  destroy() {
    this.canvas.style.cursor = 'default';
  }
}
