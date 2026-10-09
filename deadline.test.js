import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { apply, TodoNoteOperations, createRouteHandler, parameters } from './host-calendar.js';
import { openTodoNoteStore, domainSpec, isCalendarDate, noteSchema } from './storage-calendar.js';
import { openTodoNoteStore as openOldStore } from './storage.js';

function storageMock() {
  const records = new Map();
  return { records, async open(spec) {
    for (const record of records.values()) spec.tables.notes.valueSchema.parse(record);
    return { table() { return {
      get: id => records.get(id), entries: () => records.entries(),
      async put(id, note) { records.set(id, spec.tables.notes.valueSchema.parse(structuredClone(note))); },
      async delete(id) { return records.delete(id); },
    }; }, async close() {} };
  } };
}
async function fixture() {
  const storage = storageMock(); let sequence = 0;
  const store = await openTodoNoteStore(storage, { uuid: () => `note-${++sequence}` });
  const prompts = [], creates = [];
  const controller = {
    async create(input) { creates.push(input); return { sessionId: `session-${creates.length}` }; },
    async prompt(input) { prompts.push(input); return { accepted: true }; },
  };
  return { storage, store, prompts, creates, controller, operations: new TodoNoteOperations(store, controller) };
}
async function request(handler, value, { method = 'POST', authorized = true } = {}) {
  const req = Readable.from(value === undefined ? [] : [JSON.stringify(value)]);
  req.method = method; req.headers = { 'content-type': 'application/json', authorization: authorized ? 'allowed' : '' };
  const res = { setHeader() {}, writeHead(status) { this.status = status; }, end(value) { this.value = JSON.parse(value); } };
  await handler(req, res); return res;
}

const validDates = ['0001-01-01', '0099-02-28', '0400-02-29', '1900-02-28', '2000-02-29', '2024-02-29', '2026-12-31', '9999-12-31'];
const invalidDates = ['0000-01-01', '1900-02-29', '2100-02-29', '2023-02-29', '2024-02-30', '2026-04-31', '2026-06-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', '2026-1-01', '2026-01-1', '2026-01-01T00:00:00Z', '2026-01-01\n', ' 2026-01-01', '2026/01/01', '+2026-01-01', '10000-01-01', '', 123, false, {}, []];

test('calendar validation uses exact Gregorian dates, not JS timestamp coercion', () => {
  for (const date of validDates) assert.equal(isCalendarDate(date), true, String(date));
  for (const date of invalidDates) assert.equal(isCalendarDate(date), false, String(date));
  assert.equal(isCalendarDate(null), false);
});

test('create supports deadline, absent deadline, and explicit null', async () => {
  const f = await fixture();
  for (const dueDate of validDates) {
    const result = await f.operations.execute({ action: 'create', title: 'Scheduled', dueDate });
    assert.equal(result.note.dueDate, dueDate);
  }
  const plain = await f.operations.execute({ action: 'create', title: 'No deadline' });
  assert.equal(Object.hasOwn(plain.note, 'dueDate'), false);
  const cleared = await f.operations.execute({ action: 'create', title: 'Explicit none', dueDate: null });
  assert.equal(cleared.note.dueDate, null);
});

test('update sets/changes/clears deadline and partial edits preserve all other fields', async () => {
  const f = await fixture();
  const { note } = await f.operations.execute({ action: 'create', title: 'Task', body: 'Details', completed: true, dueDate: '2026-12-31' });
  await f.store.update(note.id, { sessionId: 'existing-session' });
  const changed = await f.operations.execute({ action: 'update', id: note.id, dueDate: '2028-02-29' });
  assert.equal(changed.note.title, 'Task'); assert.equal(changed.note.body, 'Details');
  assert.equal(changed.note.completed, true); assert.equal(changed.note.sessionId, 'existing-session');
  assert.equal(changed.note.createdAt, note.createdAt);
  await f.operations.execute({ action: 'update', id: note.id, title: 'Renamed' });
  await f.operations.execute({ action: 'update', id: note.id, completed: false });
  await f.operations.execute({ action: 'update', id: note.id, body: 'New body', dueDate: undefined });
  assert.equal(f.store.get(note.id).dueDate, '2028-02-29');
  const cleared = await f.operations.execute({ action: 'update', id: note.id, dueDate: null });
  assert.equal(cleared.note.dueDate, null); assert.equal(cleared.note.sessionId, 'existing-session');
  await f.operations.execute({ action: 'update', id: note.id, body: 'After clear' });
  assert.equal(f.store.get(note.id).dueDate, null);
  await f.operations.execute({ action: 'update', id: note.id, dueDate: '0001-01-01' });
  assert.equal(f.store.get(note.id).dueDate, '0001-01-01');
});

test('invalid create/update dates are rejected without modifying or losing stored notes', async () => {
  const f = await fixture();
  const { note } = await f.operations.execute({ action: 'create', title: 'Original', dueDate: '2026-10-09' });
  for (const dueDate of invalidDates) {
    await assert.rejects(f.operations.execute({ action: 'create', title: 'Invalid', dueDate }), { code: 'INVALID_INPUT' });
    await assert.rejects(f.operations.execute({ action: 'update', id: note.id, dueDate }), { code: 'INVALID_INPUT' });
  }
  await assert.rejects(f.operations.execute({ action: 'update', id: note.id, dueDate: undefined }), { code: 'INVALID_INPUT' });
  assert.deepEqual(await f.store.list(), [note]);
  await assert.rejects(f.store.update(note.id, { dueDate: '2026-02-30' }));
  assert.deepEqual(f.store.get(note.id), note);
});

test('real on-disk v1 records reopen under v2 compatibility, preserving fields and mixed stamps', async t => {
  const base = '/home/ubuntu/.nvm/versions/node/v24.21.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai';
  const { DomainFacility } = await import(`${base}/dsh-storage-domain/lib/index.js`);
  const { JsonStorageBackend } = await import(`${base}/dsh-storage-json/lib/index.js`);
  const root = await mkdtemp(fileURLToPath(new URL('./.test-deadline-', import.meta.url)));
  t.after(() => rm(root, { recursive: true, force: true }));
  const active = [];
  t.after(async () => { for (const [store, backend] of active.reverse()) { await store.close(); await backend.close(); } });
  async function open(openStore) {
    const backend = new JsonStorageBackend(root);
    const facility = new DomainFacility({ storage: { backend: { get: () => backend } }, emit() {}, logger: console }, { backend: 'json' });
    const store = await openStore(facility); active.push([store, backend]); return store;
  }
  const old = await open(openOldStore);
  const legacy = await old.create({ title: 'Legacy title', body: 'Legacy body', completed: true });
  await old.update(legacy.id, { sessionId: 'legacy-session' });
  const untouched = await old.create({ title: 'Keep v1 untouched', body: 'Do not rewrite' });
  const original = old.get(legacy.id);
  await old.close(); await active[0][1].close();
  const untouchedPath = `${root}/todo_note/notes/${untouched.id}.json`;
  const untouchedBytes = await readFile(untouchedPath, 'utf8');
  assert.equal(JSON.parse(untouchedBytes).version, 1);
  assert.equal(domainSpec.name, 'todo_note'); assert.equal(domainSpec.version, 2);
  assert.deepEqual(domainSpec.compatibleVersions, [1]);
  const current = await open(openTodoNoteStore);
  assert.deepEqual(current.get(legacy.id), original);
  assert.equal(Object.hasOwn(current.get(legacy.id), 'dueDate'), false);
  await current.update(legacy.id, { dueDate: '2028-02-29' });
  assert.deepEqual(current.get(legacy.id), { ...original, dueDate: '2028-02-29', updatedAt: current.get(legacy.id).updatedAt });
  const document = JSON.parse(await readFile(`${root}/todo_note/notes/${legacy.id}.json`, 'utf8'));
  assert.equal(document.version, 2); assert.equal(document.record.dueDate, '2028-02-29');
  assert.equal(await readFile(untouchedPath, 'utf8'), untouchedBytes);
  await current.close(); await active[1][1].close();
  const reopened = await open(openTodoNoteStore);
  assert.equal((await reopened.list()).length, 2);
  assert.equal(reopened.get(legacy.id).dueDate, '2028-02-29');
  assert.equal(reopened.get(legacy.id).sessionId, 'legacy-session');
  assert.deepEqual(reopened.get(untouched.id), untouched);
  await reopened.update(legacy.id, { dueDate: null });
  await reopened.close(); await active[2][1].close();
  const final = await open(openTodoNoteStore);
  assert.equal(final.get(legacy.id).dueDate, null);
  assert.equal(final.get(legacy.id).body, 'Legacy body');
});

test('same live DomainFacility releases v1 domain before reopening deadline schema', async t => {
  const base = '/home/ubuntu/.nvm/versions/node/v24.21.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai';
  const { DomainFacility } = await import(`${base}/dsh-storage-domain/lib/index.js`);
  const { JsonStorageBackend } = await import(`${base}/dsh-storage-json/lib/index.js`);
  const root = await mkdtemp(fileURLToPath(new URL('./.test-deadline-reactivate-', import.meta.url)));
  const backend = new JsonStorageBackend(root);
  const facility = new DomainFacility({ storage: { backend: { get: () => backend } }, emit() {}, logger: console }, { backend: 'json' });
  t.after(async () => { await facility.closeAll(); await backend.close(); await rm(root, { recursive: true, force: true }); });
  const old = await openOldStore(facility, { uuid: () => 'shared-note' });
  await old.create({ title: 'Existing shared note', body: 'Keep this', completed: true });
  await old.update('shared-note', { sessionId: 'previous-chat' });
  const before = old.get('shared-note');
  await old.close();
  assert.equal(facility.get('todo_note'), undefined);
  const calendar = await openTodoNoteStore(facility);
  assert.deepEqual(calendar.get('shared-note'), before);
  await calendar.update('shared-note', { dueDate: '2032-02-29' });
  assert.equal(calendar.get('shared-note').sessionId, 'previous-chat');
  assert.equal(calendar.get('shared-note').dueDate, '2032-02-29');
  await calendar.close();
  const reopened = await openTodoNoteStore(facility);
  assert.equal(reopened.get('shared-note').dueDate, '2032-02-29');
});

test('UI and agent tool accept the same deadline operations and return identical failures', async () => {
  const storage = storageMock(), cleanups = []; let route, tool;
  const ctx = {
    storageDomain: storage, connection: { requestRejection: req => req.headers.authorization === 'allowed' ? undefined : 401 },
    sessionController: { async create() { return { sessionId: 'chat' }; }, async prompt() { return { accepted: true }; } },
    webServer: { register(value) { route = value; return () => {}; } },
    tools: { register(value) { tool = value; return () => {}; } },
    effect(setup) { cleanups.push(setup()); },
  };
  await apply(ctx, {});
  const exec = { signal: new AbortController().signal };
  assert.deepEqual(parameters.properties.dueDate.type, ['string', 'null']);
  const created = await tool.execute({ action: 'create', title: 'Tool deadline', dueDate: '2028-02-29' }, exec);
  assert.deepEqual((await request(route.handler, undefined, { method: 'GET' })).value.notes, [created.note]);
  const changed = await request(route.handler, { action: 'update', id: created.note.id, dueDate: '2029-03-01' });
  assert.equal(changed.status, 200);
  assert.deepEqual((await tool.execute({ action: 'list' }, exec)).notes, [changed.value.note]);
  const bad = { action: 'update', id: created.note.id, dueDate: '2029-02-29' };
  assert.deepEqual(await tool.execute(bad, exec), (await request(route.handler, bad)).value);
  assert.equal((await request(route.handler, bad)).status, 400);
  const cleared = await tool.execute({ action: 'update', id: created.note.id, dueDate: null }, exec);
  assert.deepEqual((await request(route.handler, undefined, { method: 'GET' })).value.notes, [cleared.note]);
  const denied = await request(route.handler, { action: 'update', id: created.note.id, dueDate: '2030-01-01' }, { authorized: false });
  assert.equal(denied.status, 401);
  assert.equal(storage.records.get(created.note.id).dueDate, null);
  for (const cleanup of cleanups.reverse()) await cleanup();
});

test('start_chat includes a saved deadline, preserves it when linking session, and omits it when cleared', async () => {
  const f = await fixture();
  const { note } = await f.operations.execute({ action: 'create', title: 'Ship', body: 'Upload to GitHub', dueDate: '2026-12-31' });
  await f.operations.execute({ action: 'start_chat', id: note.id });
  assert.match(f.prompts[0].content[0].text, /截止日期：2026-12-31/);
  assert.match(f.prompts[0].content[0].text, /Ship\n\nUpload to GitHub/);
  assert.equal(f.store.get(note.id).dueDate, '2026-12-31');
  assert.equal(f.store.get(note.id).sessionId, 'session-1');
  await f.operations.execute({ action: 'update', id: note.id, dueDate: null });
  await f.operations.execute({ action: 'start_chat', id: note.id });
  assert.doesNotMatch(f.prompts[1].content[0].text, /截止日期/);
  assert.deepEqual(f.creates, [{ cwd: '/home/ubuntu/dsh-todo-note' }, { cwd: '/home/ubuntu/dsh-todo-note' }]);
});

test('schema accepts old records without a deadline and rejects corrupt stored calendar dates', () => {
  const old = { id: 'old', title: 'Old', body: '', completed: false, createdAt: 'x', updatedAt: 'x', sessionId: 'saved' };
  assert.deepEqual(noteSchema.parse(old), old);
  assert.throws(() => noteSchema.parse({ ...old, dueDate: '2026-02-30' }));
});
