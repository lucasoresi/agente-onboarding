import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { isStepCount } from 'ai';

describe('dependencias', () => {
  it('cargan xlsx 0.20.x y ai 7', () => {
    expect(XLSX.version.startsWith('0.20.')).toBe(true);
    expect(typeof isStepCount).toBe('function');
  });
});
