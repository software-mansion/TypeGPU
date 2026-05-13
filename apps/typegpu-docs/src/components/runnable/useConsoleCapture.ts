import { useState } from 'react';

type ConsoleMethod = 'log' | 'debug' | 'info' | 'warn' | 'error';

const consoleMethods: readonly ConsoleMethod[] = ['log', 'debug', 'info', 'warn', 'error'];

function stringifyArg(arg: unknown) {
  if (typeof arg === 'string') {
    return arg;
  }
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}`;
  }
  return String(arg);
}

function formatArgs(args: unknown[]) {
  const [first, ...rest] = args;

  if (typeof first === 'string') {
    const styleCount = first.match(/%c/g)?.length ?? 0;
    const text = first.replaceAll('%c', '');
    const visible = rest.slice(styleCount).map(stringifyArg);
    return [text, ...visible].filter((part) => part.length > 0).join(' ');
  }

  return args.map(stringifyArg).join(' ');
}

function appendOutput(current: string, lines: string[]) {
  const next = lines.filter((line) => line.length > 0).join('\n');
  if (!next) {
    return current;
  }
  return current ? `${current}\n${next}` : next;
}

export type ConsoleCapture = {
  output: string;
  captureDuring: <T>(fn: () => T | Promise<T>) => Promise<T>;
};

export function useConsoleCapture(): ConsoleCapture {
  const [output, setOutput] = useState('');

  async function captureDuring<T>(fn: () => T | Promise<T>): Promise<T> {
    const captured: string[] = [];
    const originals = Object.fromEntries(
      consoleMethods.map((method) => [method, console[method]]),
    ) as Record<ConsoleMethod, (...args: unknown[]) => void>;

    for (const method of consoleMethods) {
      console[method] = (...args: unknown[]) => {
        captured.push(formatArgs(args));
        originals[method](...args);
      };
    }

    try {
      const result = await fn();
      setOutput((current) => appendOutput(current, captured));
      return result;
    } catch (error) {
      setOutput((current) => appendOutput(current, [...captured, stringifyArg(error)]));
      throw error;
    } finally {
      for (const method of consoleMethods) {
        console[method] = originals[method];
      }
    }
  }

  return { output, captureDuring };
}
