import { randomUUID } from 'node:crypto';
import type { ParsedFile } from '@/lib/validation/types';

export const FILE_TTL_MS = 60 * 60 * 1000;

export class FileStore {
  private files = new Map<string, { file: ParsedFile; expiresAt: number }>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs = FILE_TTL_MS,
  ) {}

  put(file: ParsedFile): string {
    this.sweep();
    const id = `f_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    this.files.set(id, { file, expiresAt: this.now() + this.ttlMs });
    return id;
  }

  get(id: string): ParsedFile | undefined {
    const entry = this.files.get(id);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.files.delete(id);
      return undefined;
    }
    return entry.file;
  }

  private sweep() {
    const t = this.now();
    for (const [id, e] of this.files) if (e.expiresAt <= t) this.files.delete(id);
  }
}

// En `next dev` los módulos se recargan: el singleton vive en globalThis para no perder los archivos.
const g = globalThis as unknown as { __onboardingFileStore?: FileStore };
export const fileStore = (g.__onboardingFileStore ??= new FileStore());
