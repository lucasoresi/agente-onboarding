import { describe, expect, it } from 'vitest';
import { FileStore } from '@/lib/files/store';
import { parsed } from '../helpers';

describe('FileStore', () => {
  it('guarda y devuelve por id hasta que vence', () => {
    let now = 1_000;
    const store = new FileStore(() => now, 100);
    const id = store.put(parsed('a.csv', [['x']]));
    expect(id).toMatch(/^f_[a-z0-9]{12}$/);
    expect(store.get(id)?.fileName).toBe('a.csv');
    now = 1_099;
    expect(store.get(id)).toBeDefined();
    now = 1_100;
    expect(store.get(id)).toBeUndefined();
  });

  it('id inexistente → undefined', () => {
    expect(new FileStore().get('f_nada')).toBeUndefined();
  });
});
