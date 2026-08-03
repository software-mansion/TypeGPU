import { describe, expect, it, vi } from 'vitest';
import { TgpuLogger } from '../../src/tgpuLogger.ts';

describe('tgpuLogger', () => {
  it('warns through console.warn', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = new TgpuLogger(false);

    logger.warn('deprecated', 'this is deprecated');

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy.mock.calls[0]).toMatchInlineSnapshot(`
      [
        "⚠️ [deprecated] ",
        "this is deprecated",
      ]
    `);
  });

  it('does not warn after disabling', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = new TgpuLogger(false);

    logger.disable('deprecated');
    logger.warn('deprecated', 'this is deprecated');

    expect(consoleWarnSpy).toHaveBeenCalledTimes(0);
  });

  it('starts warning after reset', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = new TgpuLogger(false);

    logger.disable('deprecated');
    logger.reset();
    logger.warn('deprecated', 'this is deprecated');

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy.mock.calls[0]).toMatchInlineSnapshot(`
      [
        "⚠️ [deprecated] ",
        "this is deprecated",
      ]
    `);
  });

  it('works with multiple arguments', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = new TgpuLogger(false);

    logger.warn('suspicious', 'there is an impostor among us', 42, { prop: 1 });

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy.mock.calls[0]).toMatchInlineSnapshot(`
      [
        "⚠️ [suspicious] ",
        "there is an impostor among us",
        42,
        {
          "prop": 1,
        },
      ]
    `);
  });

  it('only silences the disabled type', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = new TgpuLogger(false);

    logger.disable('deprecated');
    logger.warn('suspicious', 'still warns');

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy.mock.calls[0]).toMatchInlineSnapshot(`
      [
        "⚠️ [suspicious] ",
        "still warns",
      ]
    `);
  });

  it('has stricter rules in prod mode', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = new TgpuLogger(true);

    logger.warn('suspicious', '...');
    logger.warn('deprecated', '...');
    logger.warn('fallback', '...');

    expect(consoleWarnSpy).toHaveBeenCalledTimes(0);
  });

  it('correctly resets to initial state', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = new TgpuLogger(true);

    logger.reset();
    logger.warn('suspicious', '...');
    logger.warn('deprecated', '...');
    logger.warn('fallback', '...');

    expect(consoleWarnSpy).toHaveBeenCalledTimes(0);
  });
});
