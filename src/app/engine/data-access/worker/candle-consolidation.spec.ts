import { CandleConsolidation } from './candle-consolidation';
import { InMemoryEngineStorage } from './in-memory-engine-storage';

// Scheduling of the consolidation job (TS §6.8): which year is next.

const EPOCH_MS = Date.UTC(2020, 0, 1);

function day(year: number, month: number, date: number): number {
  return (Date.UTC(year, month - 1, date) - EPOCH_MS) / 86_400_000;
}

class BrokenStorage extends InMemoryEngineStorage {
  override async consolidateCandles(): Promise<never> {
    throw new Error('broken');
  }
}

describe('CandleConsolidation', () => {
  function job(
    storage = new InMemoryEngineStorage(),
    consolidated: number[] = [],
  ): CandleConsolidation {
    return new CandleConsolidation(storage, 'p1', ['a', 'b'], 2020, 20, consolidated);
  }

  it('takes the oldest due year that is neither consolidated nor blocked', () => {
    const consolidation = job(undefined, [2020]);
    // 15.03.2045: the years up to 2024 are due.
    expect(consolidation.nextYear(day(2045, 3, 15), () => false)).toBe(2021);
    expect(consolidation.nextYear(day(2045, 3, 15), (year) => year < 2024)).toBe(2024);
    expect(consolidation.nextYear(day(2045, 3, 15), (year) => year <= 2024)).toBeUndefined();
    expect(consolidation.nextYear(day(2040, 12, 31), () => false)).toBeUndefined();
  });

  it('settles a year for the load whatever the storage answers, also a failure', async () => {
    const empty = job();
    expect(await empty.run(2021)).toBe('none');
    expect(empty.nextYear(day(2042, 1, 1), () => false)).toBe(2020);

    const broken = job(new BrokenStorage());
    await expect(broken.run(2020)).rejects.toThrow('broken');
    expect(broken.running).toBe(false);
    expect(broken.nextYear(day(2042, 1, 1), () => false)).toBe(2021);
  });
});
