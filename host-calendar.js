import { randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { openTodoNoteStore, TodoNoteError, dueDateSchema } from './storage-calendar.js';

export const name = 'todo-note';
export const inject = ['storageDomain', 'webServer', 'connection', 'tools', 'sessionController'];
export const DEFAULT_CWD = '/home/ubuntu/dsh-todo-note';
export const Config = z.object({ cwd: z.string().refine(isAbsolute).default(DEFAULT_CWD) });

const title = z.string().trim().min(1).max(500);
const body = z.string().max(100000);
const id = z.string().min(1).max(200);
const inputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }).strict(),
  z.object({ action: z.literal('create'), title, body: body.optional(), completed: z.boolean().optional(), dueDate: dueDateSchema.optional() }).strict(),
  z.object({ action: z.literal('update'), id, title: title.optional(), body: body.optional(), completed: z.boolean().optional(), dueDate: dueDateSchema.optional() }).strict()
    .refine(value => ['title', 'body', 'completed', 'dueDate'].some(key => value[key] !== undefined), 'Provide at least one field to update.'),
  z.object({ action: z.literal('delete'), id }).strict(),
  z.object({ action: z.literal('start_chat'), id, cwd: z.string().refine(isAbsolute, 'cwd must be absolute.').optional() }).strict(),
]);

export const parameters = {
  type: 'object', additionalProperties: false, required: ['action'],
  properties: {
    action: { type: 'string', enum: ['list', 'create', 'update', 'delete', 'start_chat'] },
    id: { type: 'string', description: 'Note ID; required for update, delete, and start_chat.' },
    title: { type: 'string', description: 'Nonempty title (up to 500 characters); required for create.' },
    body: { type: 'string', description: 'Note text, up to 100000 characters; create defaults to empty.' },
    completed: { type: 'boolean', description: 'Completion flag; create defaults to false.' },
    dueDate: { type: ['string', 'null'], description: 'Optional deadline for create/update: real calendar date YYYY-MM-DD, year 0001–9999. Omit to preserve on update or create without a deadline; null clears it.' },
    cwd: { type: 'string', description: `Absolute working directory for start_chat; defaults to plugin configuration (${DEFAULT_CWD}).` },
  },
};

export class TodoNoteOperations {
  constructor(store, sessionController, cwd = DEFAULT_CWD) {
    this.store = store; this.sessionController = sessionController; this.cwd = cwd;
  }
  async execute(raw, signal = new AbortController().signal) {
    const parsed = inputSchema.safeParse(raw);
    if (!parsed.success) throw new TodoNoteError('INVALID_INPUT', parsed.error.issues.map(issue => issue.message).join('; '));
    const input = parsed.data;
    if (signal.aborted) throw new TodoNoteError('CANCELLED', 'Operation cancelled.', 409);
    switch (input.action) {
      case 'list': return { ok: true, notes: await this.store.list() };
      case 'create': return { ok: true, note: await this.store.create(input) };
      case 'update': {
        const { action, id, ...patch } = input;
        return { ok: true, note: await this.store.update(id, patch) };
      }
      case 'delete': return { ok: true, ...await this.store.delete(input.id) };
      case 'start_chat': return this.startChat(input, signal);
    }
  }
  async startChat(input, signal) {
    await this.store.pending;
    const note = this.store.get(input.id);
    // The ordinary Session controller owns its roots and preserves deployment
    // model/preset/approval defaults. Never create through a caller Agent context.
    const { sessionId } = await this.sessionController.create({ cwd: input.cwd ?? this.cwd });
    try {
      await this.store.update(note.id, { sessionId });
      await this.sessionController.prompt({ sessionId, requestId: `todo-note-${randomUUID()}`,
        mode: 'queue', content: [{ type: 'text', text: `根据以下 TODO/note 帮助我推进任务。请遵循当前会话的权限与审批策略。\n\n${note.title}\n\n${note.body}${note.dueDate ? `\n\n截止日期：${note.dueDate}` : ''}` }] }, signal);
    } catch (error) {
      throw new TodoNoteError('CHAT_START_FAILED', `Session created, but note linking or prompt admission failed: ${error.message ?? String(error)}`, 500, { sessionId });
    }
    return { ok: true, sessionId };
  }
}

export function failure(error) {
  return { ok: false, error: { code: error.code ?? 'INTERNAL_ERROR',
    message: error.message ?? 'Operation failed.', ...(error.details ?? {}) } };
}

function send(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

export function createRouteHandler(connection, operations) {
  return async (req, res) => {
    const rejection = connection.requestRejection(req);
    if (rejection !== undefined) {
      send(res, rejection, failure(new TodoNoteError('UNAUTHORIZED', 'Request is not authorized.', rejection)));
      return;
    }
    try {
      if (req.method === 'GET') { send(res, 200, await operations.execute({ action: 'list' })); return; }
      if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); throw new TodoNoteError('METHOD_NOT_ALLOWED', 'Use GET or POST.', 405); }
      if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type'] ?? ''))) {
        throw new TodoNoteError('UNSUPPORTED_MEDIA_TYPE', 'Send application/json.', 415);
      }
      const chunks = []; let bytes = 0;
      for await (const chunk of req) {
        const data = Buffer.from(chunk); bytes += data.length;
        if (bytes > 512000) throw new TodoNoteError('BODY_TOO_LARGE', 'Request body is too large.', 413);
        chunks.push(data);
      }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new TodoNoteError('INVALID_JSON', 'Request body must be valid JSON.'); }
      send(res, 200, await operations.execute(input));
    } catch (error) { send(res, error.status ?? 500, failure(error)); }
  };
}

export async function apply(ctx, config = {}) {
  const { cwd } = Config.parse(config);
  const store = await openTodoNoteStore(ctx.storageDomain);
  ctx.effect(() => () => store.close());
  const operations = new TodoNoteOperations(store, ctx.sessionController, cwd);
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/api/todo-note',
    handler: createRouteHandler(ctx.connection, operations) }));
  // Host-global registration: notes are shared profile data, not session state.
  // Scoped tool restrictions/guards remain enforced by the registry normally.
  ctx.effect(() => ctx.tools.register({
    name: 'todo_note',
    description: 'Manage shared persistent TODO notes: list, create, update, delete, or start_chat. Delete permanently removes a note. start_chat launches an independent normal chat from its title/body without changing approval policy; returns sessionId.',
    parameters,
    output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      try { return await operations.execute(args, exec.signal); }
      catch (error) { return failure(error); }
    },
    isConcurrencySafe: args => args?.action === 'list',
  }));
}
