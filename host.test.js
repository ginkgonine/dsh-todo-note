import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { apply, TodoNoteOperations, createRouteHandler, DEFAULT_CWD } from './index.js';
import { openTodoNoteStore } from './store.js';

function storageMock() {
  const records = new Map(); let closed = 0; const specs = [];
  return { records, specs, get closed() { return closed; },
    async open(spec) {
      specs.push(spec);
      for (const note of records.values()) spec.tables.notes.valueSchema.parse(note);
      return { table(name) {
        assert.equal(name, 'notes');
        return { get: key => records.get(key), entries: () => records.entries(),
          async put(key, value) { spec.tables.notes.valueSchema.parse(value); records.set(key, structuredClone(value)); },
          async delete(key) { return records.delete(key); } };
      }, async close() { closed++; } };
    } };
}
async function fixture() {
  const storage = storageMock(); let number = 0;
  const store = await openTodoNoteStore(storage, { uuid: () => `note-${++number}` });
  const creates = [], prompts = [];
  const controller = {
    async create(request) { creates.push(request); return { sessionId: `session-${creates.length}` }; },
    async prompt(request, signal) { prompts.push({ request, signal }); return { accepted: true }; },
  };
  return { storage, store, creates, prompts, controller, operations: new TodoNoteOperations(store, controller) };
}
async function request(handler, { method = 'POST', value, raw, contentType = 'application/json', headers = {} } = {}) {
  const req = Readable.from(raw === undefined ? (value === undefined ? [] : [JSON.stringify(value)]) : [raw]);
  req.method = method; req.headers = { 'content-type': contentType, ...headers };
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; },
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); },
    end(body) { this.value = JSON.parse(body); } };
  await handler(req, res); return res;
}

test('installed DomainFacility and JSON backend persist notes on disk across reopen', async t => {
  const base = '/home/ubuntu/.nvm/versions/node/v24.21.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai';
  const { DomainFacility } = await import(`${base}/dsh-storage-domain/lib/index.js`);
  const { JsonStorageBackend } = await import(`${base}/dsh-storage-json/lib/index.js`);
  const { mkdtemp, rm, readFile } = await import('node:fs/promises');
  const root = await mkdtemp(`${process.cwd()}/.test-storage-`);
  t.after(() => rm(root, { recursive: true, force: true }));
  function facility(backend) {
    return new DomainFacility({ storage: { backend: { get: () => backend } }, emit() {}, logger: console }, { backend: 'json' });
  }
  const backend = new JsonStorageBackend(root);
  const first = await openTodoNoteStore(facility(backend), { uuid: () => 'disk-note' });
  await first.create({ title: 'Disk task', body: 'Persistent body' });
  await first.update('disk-note', { completed: true, sessionId: 'session-disk' });
  await first.close(); await backend.close();
  const record = JSON.parse(await readFile(`${root}/todo_note/notes/disk-note.json`, 'utf8'));
  assert.ok(JSON.stringify(record).includes('Persistent body'));
  const nextBackend = new JsonStorageBackend(root);
  const next = await openTodoNoteStore(facility(nextBackend));
  assert.equal(next.get('disk-note').completed, true);
  assert.equal(next.get('disk-note').sessionId, 'session-disk');
  await next.delete('disk-note'); await next.close(); await nextBackend.close();
  const lastBackend = new JsonStorageBackend(root);
  const last = await openTodoNoteStore(facility(lastBackend));
  assert.deepEqual(await last.list(), []);
  await last.close(); await lastBackend.close();
});

test('CRUD persists across store reopen and returns detached snapshots', async () => {
  const f = await fixture();
  const created = await f.operations.execute({ action: 'create', title: ' Task ', body: 'Details' });
  assert.equal(created.note.title, 'Task'); assert.equal(created.note.completed, false);
  created.note.title = 'mutated';
  assert.equal((await f.operations.execute({ action: 'list' })).notes[0].title, 'Task');
  await Promise.all([
    f.operations.execute({ action: 'update', id: 'note-1', completed: true }),
    f.operations.execute({ action: 'update', id: 'note-1', body: 'New details' }),
  ]);
  await f.store.close();
  const reopened = await openTodoNoteStore(f.storage);
  assert.equal(reopened.get('note-1').completed, true);
  assert.equal(reopened.get('note-1').body, 'New details');
  assert.equal(f.storage.specs[0].name, 'todo_note');
  assert.equal(f.storage.specs[0].layout, 'per-record');
  assert.deepEqual(await reopened.delete('note-1'), { id: 'note-1', deleted: true });
  assert.deepEqual(await reopened.list(), []);
  await assert.rejects(reopened.delete('note-1'), { code: 'NOT_FOUND' });
});

test('durable write failure leaves prior record intact and queue recovers', async () => {
  const f = await fixture();
  await f.operations.execute({ action: 'create', title: 'Original' });
  const put = f.store.table.put;
  f.store.table.put = async () => { throw new Error('storage unavailable'); };
  await assert.rejects(f.operations.execute({ action: 'update', id: 'note-1', title: 'Lost' }), /storage unavailable/);
  assert.equal(f.store.get('note-1').title, 'Original');
  f.store.table.put = put;
  await f.operations.execute({ action: 'update', id: 'note-1', title: 'Recovered' });
  assert.equal(f.store.get('note-1').title, 'Recovered');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.operations.execute({ action: 'start_chat', id: 'note-1' }, controller.signal), { code: 'CANCELLED' });
  assert.equal(f.creates.length, 0);
});

test('input validation prevents empty patches, authority fields and invalid cwd', async () => {
  const { operations } = await fixture();
  for (const input of [{ action: 'create', title: ' ' }, { action: 'update', id: 'x' },
    { action: 'start_chat', id: 'x', cwd: 'relative' },
    { action: 'start_chat', id: 'x', approvalPolicy: 'danger-full-access' },
    { action: 'create', title: 'x', completed: 'true' }, { action: 'unknown' }, null]) {
    await assert.rejects(operations.execute(input), { code: 'INVALID_INPUT' });
  }
});

test('start_chat creates ordinary default-policy root and admits user prompt', async () => {
  const f = await fixture();
  await f.operations.execute({ action: 'create', title: 'Plan', body: 'Build a thing' });
  assert.deepEqual(await f.operations.execute({ action: 'start_chat', id: 'note-1' }), { ok: true, sessionId: 'session-1' });
  assert.deepEqual(f.creates, [{ cwd: DEFAULT_CWD }]);
  assert.equal(f.prompts[0].request.sessionId, 'session-1');
  assert.equal(f.prompts[0].request.mode, 'queue');
  assert.match(f.prompts[0].request.content[0].text, /Plan\n\nBuild a thing/);
  assert.match(f.prompts[0].request.content[0].text, /权限与审批策略/);
  assert.equal(f.store.get('note-1').sessionId, 'session-1');
  await f.operations.execute({ action: 'start_chat', id: 'note-1', cwd: '/tmp/project' });
  assert.deepEqual(f.creates[1], { cwd: '/tmp/project' });
});

test('start_chat uses explicit workspace identity without mixing cwd or policy fields', async () => {
  const f = await fixture();
  f.operations.workspaceRegistry = {
    get: id => id === 'workspace-project' ? { id, path: '/tmp/project' } : undefined,
    resolveByPath: async () => { throw new Error('explicit workspace must not resolve default cwd'); },
  };
  await f.operations.execute({ action: 'create', title: 'Workspace task' });
  await f.operations.execute({ action: 'start_chat', id: 'note-1', workspaceId: 'workspace-project' });
  assert.deepEqual(f.creates, [{ workspaceId: 'workspace-project' }]);
  assert.equal(f.store.get('note-1').sessionId, 'session-1');
  await assert.rejects(f.operations.execute({ action: 'start_chat', id: 'note-1', workspaceId: 'missing' }), { code: 'WORKSPACE_NOT_FOUND' });
  await assert.rejects(f.operations.execute({ action: 'start_chat', id: 'note-1', workspaceId: 'workspace-project', cwd: '/tmp/project' }), { code: 'INVALID_INPUT' });
  assert.equal(f.creates.length, 1);
});

test('legacy cwd resolves registered workspace, and only unowned paths remain ungrouped', async () => {
  const f = await fixture(); const paths = [];
  f.operations.workspaceRegistry = { async resolveByPath(path) {
    paths.push(path);
    return path === '/tmp/project-link/' ? { id: 'workspace-project', path: '/tmp/project' } : undefined;
  } };
  await f.operations.execute({ action: 'create', title: 'Task' });
  await f.operations.execute({ action: 'start_chat', id: 'note-1', cwd: '/tmp/project-link/' });
  await f.operations.execute({ action: 'start_chat', id: 'note-1', cwd: '/tmp/unowned' });
  assert.deepEqual(paths, ['/tmp/project-link/', '/tmp/unowned']);
  assert.deepEqual(f.creates, [{ workspaceId: 'workspace-project' }, { cwd: '/tmp/unowned' }]);
});

test('workspace lookup failures and cancellation never create an ungrouped fallback', async () => {
  const f = await fixture();
  await f.operations.execute({ action: 'create', title: 'Task' });
  f.operations.workspaceRegistry = { resolveByPath: async () => { throw new Error('registry unavailable'); } };
  await assert.rejects(f.operations.execute({ action: 'start_chat', id: 'note-1' }), /registry unavailable/);
  const abort = new AbortController();
  f.operations.workspaceRegistry.resolveByPath = async () => { abort.abort(); return { id: 'workspace-project' }; };
  await assert.rejects(f.operations.execute({ action: 'start_chat', id: 'note-1' }, abort.signal), { code: 'CANCELLED' });
  assert.equal(f.creates.length, 0); assert.equal(f.prompts.length, 0);
});

test('installed Session controller uses workspace directory and attaches membership before prompt', async () => {
  const base = '/home/ubuntu/.nvm/versions/node/v24.21.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai';
  const { SessionCommandController } = await import(`${base}/dsh-api-session-controller/lib/types/commands.js`);
  const f = await fixture(); const members = [], roots = [];
  const workspace = { id: 'workspace-project', path: DEFAULT_CWD,
    async attachSession(id) { members.push(id); } };
  const registry = { get: id => id === workspace.id ? workspace : undefined };
  const commands = new SessionCommandController({ workspaceRegistry: registry }, {
    async ensureSession(id, cwd, adopting, preset) { roots.push({ id, cwd, adopting, preset }); return { session: { id } }; },
    presetForSession: () => undefined,
  }, '/tmp/different-default');
  f.operations.workspaceRegistry = registry;
  f.controller.create = input => commands.create(input);
  f.controller.prompt = async input => { assert.deepEqual(members, [input.sessionId]); return { accepted: true }; };
  await f.operations.execute({ action: 'create', title: 'Task' });
  const result = await f.operations.execute({ action: 'start_chat', id: 'note-1', workspaceId: workspace.id });
  assert.equal(roots[0].cwd, DEFAULT_CWD);
  assert.equal(roots[0].adopting, false); assert.equal(roots[0].preset, undefined);
  assert.deepEqual(members, [result.sessionId]);
});

test('workspace attachment failure keeps controller partial-session details for recovery', async () => {
  const f = await fixture();
  await f.operations.execute({ action: 'create', title: 'Task' });
  f.operations.workspaceRegistry = { get: id => ({ id }) };
  f.controller.create = async () => { throw Object.assign(new Error('attachment failed'), {
    code: 'session/workspace-attach-failed', details: { sessionId: 'partial-session', workspaceId: 'workspace-project' },
  }); };
  await assert.rejects(f.operations.execute({ action: 'start_chat', id: 'note-1', workspaceId: 'workspace-project' }), error => {
    assert.equal(error.details.sessionId, 'partial-session'); return true;
  });
  assert.equal(f.prompts.length, 0);
});

test('failed prompt preserves created session identity and note link', async () => {
  const f = await fixture();
  await f.operations.execute({ action: 'create', title: 'Task' });
  f.controller.prompt = async () => { throw new Error('offline'); };
  await assert.rejects(f.operations.execute({ action: 'start_chat', id: 'note-1' }), error => {
    assert.equal(error.code, 'CHAT_START_FAILED'); assert.equal(error.details.sessionId, 'session-1'); return true;
  });
  assert.equal(f.store.get('note-1').sessionId, 'session-1');
});

test('HTTP endpoint guards every request and handles malformed requests', async () => {
  const f = await fixture(); let checks = 0;
  const handler = createRouteHandler({ requestRejection(req) { checks++; return req.headers.authorization === 'yes' ? undefined : 401; } }, f.operations);
  assert.equal((await request(handler, { value: { action: 'create', title: 'Denied' } })).status, 401);
  assert.equal((await f.store.list()).length, 0);
  const trusted = { headers: { authorization: 'yes' } };
  assert.equal((await request(handler, { ...trusted, raw: '{' })).status, 400);
  assert.equal((await request(handler, { ...trusted, contentType: 'text/plain', raw: '{}' })).status, 415);
  assert.equal((await request(handler, { ...trusted, method: 'DELETE' })).status, 405);
  assert.equal((await request(handler, { ...trusted, raw: ' '.repeat(512001) })).status, 413);
  assert.equal((await request(handler, { ...trusted, value: { action: 'create', title: 'Allowed' } })).status, 200);
  const list = await request(handler, { ...trusted, method: 'GET' });
  assert.equal(list.value.notes[0].title, 'Allowed'); assert.equal(checks, 7);
  const missing = await request(handler, { ...trusted, value: { action: 'delete', id: 'missing' } });
  assert.equal(missing.status, 404); assert.equal(missing.value.error.code, 'NOT_FOUND');
});

test('Host registration tool and UI share data, results and failures; cleanup closes domain', async () => {
  const storage = storageMock(), cleanups = []; let route, tool;
  const ctx = { storageDomain: storage,
    workspaceRegistry: { list: () => [{ id: 'workspace-project', title: 'Project', path: DEFAULT_CWD }], get: id => id === 'workspace-project' ? { id, path: DEFAULT_CWD } : undefined, resolveByPath: async () => undefined },
    connection: { requestRejection: () => undefined },
    sessionController: { create: async () => ({ sessionId: 'new-session' }), prompt: async () => ({ accepted: true }) },
    webServer: { register(value) { route = value; return () => { route = undefined; }; } },
    tools: { register(value) { tool = value; return () => { tool = undefined; }; } },
    effect(setup) { cleanups.push(setup()); },
  };
  await apply(ctx, {});
  assert.equal(route.kind, 'exact'); assert.equal(route.path, '/api/todo-note');
  assert.equal(tool.name, 'todo_note');
  const exec = { signal: new AbortController().signal };
  const created = await tool.execute({ action: 'create', title: 'From tool' }, exec);
  const listed = await request(route.handler, { method: 'GET' });
  assert.deepEqual(listed.value.notes, [created.note]);
  const updateInput = { action: 'update', id: created.note.id, completed: true };
  const updated = await request(route.handler, { value: updateInput });
  assert.deepEqual((await tool.execute({ action: 'list' }, exec)).notes, [updated.value.note]);
  const badInput = { action: 'delete', id: 'missing' };
  assert.deepEqual(await tool.execute(badInput, exec), (await request(route.handler, { value: badInput })).value);
  assert.equal(tool.isConcurrencySafe({ action: 'list' }), true);
  assert.equal(tool.isConcurrencySafe({ action: 'delete' }), false);
  const workspaceList = await request(route.handler, { value: { action: 'list_workspaces' } });
  assert.deepEqual(await tool.execute({ action: 'list_workspaces' }, exec), workspaceList.value);
  assert.deepEqual(workspaceList.value.workspaces, [{ id: 'workspace-project', title: 'Project', path: DEFAULT_CWD }]);
  const launch = await tool.execute({ action: 'start_chat', id: created.note.id, workspaceId: 'workspace-project' }, exec);
  assert.equal(launch.sessionId, 'new-session');
  assert.deepEqual(tool.output.render({}, launch), [{ type: 'text', text: JSON.stringify(launch) }]);
  for (const cleanup of cleanups.reverse()) await cleanup();
  assert.equal(storage.closed, 1); assert.equal(route, undefined); assert.equal(tool, undefined);
});
