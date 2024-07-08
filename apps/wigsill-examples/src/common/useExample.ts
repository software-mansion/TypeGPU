type InitExampleFn<T> = () => Promise<T>;

export function useExample<T>(initExampleFn: InitExampleFn<T>) {
  return {
    init: initExampleFn,
  };
}