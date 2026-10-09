import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const noteSchema = z.object({
  id: z.string().min(1), title: z.string().trim().min(1).max(500),
  body: z.string().max(100000), completed: z.boolean(),
  createdAt: z.string(), updatedAt: z.string(), sessionId: z.string().optional(),
}).strict();

export const domainSpec = {
  name: 'todo_note', version: 1, layout: 'per-record',
  tables: { notes: { valueSchema: noteSchema } },
};

export class TodoNoteError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message); this.code = code; this.status = status; this.details = details;
  }
}

// All callers share one queue; failed durable writes never mutate cached records.
export class TodoNoteStore {
  constructor(domain, { uuid = randomUUID, now = () => new Date().toISOString() } = {}) {
    this.domain = domain; this.table = domain.table('notes');
    this.uuid = uuid; this.now = now; this.pending = Promise.resolve();
  }
  serialize(operation) {
    const result = this.pending.then(operation);
    this.pending = result.then(() => undefined, () => undefined);
    return result;
  }
  async list() {
    await this.pending;
    return [...this.table.entries()].map(([, note]) => ({ ...note }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  }
  get(id) {
    const note = this.table.get(id);
    if (!note) throw new TodoNoteError('NOT_FOUND', 'Note not found.', 404);
    return { ...note };
  }
  create(input) {
    return this.serialize(async () => {
      const time = this.now();
      const note = noteSchema.parse({ id: this.uuid(), title: input.title,
        body: input.body ?? '', completed: input.completed ?? false,
        createdAt: time, updatedAt: time });
      await this.table.put(note.id, note);
      return { ...note };
    });
  }
  update(id, patch) {
    return this.serialize(async () => {
      const note = noteSchema.parse({ ...this.get(id), ...patch, updatedAt: this.now() });
      await this.table.put(id, note);
      return { ...note };
    });
  }
  delete(id) {
    return this.serialize(async () => {
      this.get(id);
      await this.table.delete(id);
      return { id, deleted: true };
    });
  }
  async close() { await this.pending; await this.domain.close(); }
}

export async function openTodoNoteStore(storageDomain, options) {
  return new TodoNoteStore(await storageDomain.open(domainSpec), options);
}
