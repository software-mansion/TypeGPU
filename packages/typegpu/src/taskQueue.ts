export class TaskQueue {
  private _queue: (() => Promise<void>)[] = [];
  private _pending = false;

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this._queue.push(async () => {
        try {
          resolve(await task());
        } catch (e) {
          reject(e);
        }
      });
      void this._processQueue();
    });
  }

  private async _processQueue() {
    if (this._pending) {
      return;
    }
    this._pending = true;
    while (this._queue.length > 0) {
      const task = this._queue.shift();
      if (task) {
        await task();
      }
    }
    this._pending = false;
  }
}
