import { randomUUID } from 'node:crypto';
import { z } from 'zod';

/** A calendar day, independent of timezone, including Gregorian leap-year rules. */
export function isCalendarDate(value) {
  if (typeof value !== 'string' || value.length !== 10 || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= lengths[month - 1];
}

export const dueDateSchema = z.string().refine(isCalendarDate, 'dueDate must be a real calendar date in YYYY-MM-DD format (year 0001–9999).').nullable();
export const noteSchema = z.object({
  id: z.string().min(1), title: z.string().trim().min(1).max(500),
  body: z.string().max(100000), completed: z.boolean(),
  createdAt: z.string(), updatedAt: z.string(), sessionId: z.string().optional(),
  dueDate: dueDateSchema.optional(),
}).strict();

// Preserve the original domain and v1 records. The per-record backend accepts
// both stamps on reopen; only records written by this version acquire stamp 2.
export const domainSpec = {
  name: 'todo_note', version: 2, compatibleVersions: [1], layout: 'per-record',
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
        createdAt: time, updatedAt: time,
        ...(input.dueDate === undefined ? {} : { dueDate: input.dueDate }) });
      await this.table.put(note.id, note);
      return { ...note };
    });
  }
  update(id, patch) {
    return this.serialize(async () => {
      // Undefined means omission, never clear a saved deadline implicitly.
      const definedPatch = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
      const note = noteSchema.parse({ ...this.get(id), ...definedPatch, updatedAt: this.now() });
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
