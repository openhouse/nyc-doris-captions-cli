import { describe, expect, it, vi } from 'vitest';

describe('lib/db error handling', () => {
  it('wraps missing native binding errors with troubleshooting guidance', async () => {
    vi.resetModules();
    vi.doMock('react', () => ({ cache: (fn: unknown) => fn }));
    vi.doMock('better-sqlite3', () => ({
      default: vi.fn(() => {
        throw new Error('Could not locate the bindings file. Tried: release, debug');
      })
    }));

    const dbModule = await import('../lib/db');
    expect(() => dbModule.getDb()).toThrowError(dbModule.DatabaseUnavailableError);
    try {
      dbModule.getDb();
    } catch (error) {
      expect(error).toBeInstanceOf(dbModule.DatabaseUnavailableError);
      const message = (error as InstanceType<typeof dbModule.DatabaseUnavailableError>).message;
      expect(message).toContain('native bindings could not be loaded');
      expect((error as InstanceType<typeof dbModule.DatabaseUnavailableError>).troubleshooting.join(' ')).toContain(
        'approve-builds better-sqlite3'
      );
    }

    vi.resetModules();
    vi.doUnmock('better-sqlite3');
    vi.doUnmock('react');
  });
});
