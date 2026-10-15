import type { ParsedFile } from '@/lib/validation/types';

export const FILE_TTL_MS = 60 * 60 * 1000;

/** Archivos disponibles durante un request: el navegador manda el último adjunto con cada mensaje. */
export class FileStore {
  private files = new Map<string, { file: ParsedFile; expiresAt: number }>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs = FILE_TTL_MS,
  ) {}

  put(file: ParsedFile): string {
    this.sweep();
    const id = `f_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    this.files.set(id, { file, expiresAt: this.now() + this.ttlMs });
    return id;
  }

  /** Registra un archivo con el fileId que generó el navegador. */
  set(id: string, file: ParsedFile) {
    this.files.set(id, { file, expiresAt: this.now() + this.ttlMs });
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
