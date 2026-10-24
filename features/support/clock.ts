/** Runs `work` with every `new Date()` and `Date.now()` reading `at`, as runs started in the same second would. */
export async function withFixedClock<T>(at: string, work: () => Promise<T>): Promise<T> {
  const RealDate = Date;
  const fixed = new RealDate(at).getTime();
  globalThis.Date = class extends RealDate {
    constructor(...time: unknown[]) {
      if (time.length === 0) super(fixed);
      else super(...(time as [number]));
    }
    static override now(): number {
      return fixed;
    }
  } as DateConstructor;
  try {
    return await work();
  } finally {
    globalThis.Date = RealDate;
  }
}
