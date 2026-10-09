import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Lightweight element/hook harness: checks actual Page event wiring without
// requiring private Harness UI components or claiming browser visual coverage.
async function renderLaunch({ workspaces = [{ id: 'workspace-project', title: 'Project', path: '/tmp/project' }], selected = 'workspace-project', loading = false, error = '' } = {}) {
  let definition, card, cursor = 0;
  const requests = [];
  const overrides = new Map([[0, [{ id: 'note-1', title: 'Task', body: '', completed: false, createdAt: '2026-01-01' }]], [1, false], [13, 'note-1'], [14, selected], [15, workspaces], [16, loading], [17, error]]);
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) { const index = cursor++; return [overrides.has(index) ? overrides.get(index) : typeof initial === 'function' ? initial() : initial, () => {}]; },
    useEffect() {}, useRef: initial => ({ current: initial }), useSyncExternalStore: () => true,
  };
  const source = await readFile(new URL('./client.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(value) { definition = value; } } },
    AbortController, setTimeout, clearTimeout,
    fetch: async (_url, request) => { requests.push(JSON.parse(request.body)); return { ok: true, json: async () => ({ ok: true, sessionId: 'new-session' }) }; },
  });
  const plugin = definition.factory(() => React);
  plugin.apply({
    locale: { register() {}, bind: () => key => key, getSnapshot: () => ({ active: 'en' }) },
    effect: setup => setup(), uiWorkspace: { openSession() {} },
    slots: { inject: (_name, setup) => setup(), register: (spec, component) => { if (spec.name === 'shell.overlay') card = component; } },
  });
  const cardElement = card();
  const page = cardElement.children[0].type;
  return { tree: page(), requests };
}
function elements(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...(tree.children || []).flat(Infinity).flatMap(elements)];
}

test('launch UI selects registered workspace and sends workspaceId without cwd', async () => {
  const { tree, requests } = await renderLaunch();
  const nodes = elements(tree), select = nodes.find(node => node.type === 'select');
  assert.equal(select.props.value, 'workspace-project');
  assert.ok(nodes.some(node => node.type === 'option' && node.props.value === 'workspace-project' && node.children[0] === 'Project · /tmp/project'));
  const launch = nodes.find(node => node.type === 'button' && node.children[0] === 'launch');
  assert.equal(launch.props.disabled, false);
  await launch.props.onClick();
  assert.deepEqual(requests, [{ action: 'start_chat', id: 'note-1', workspaceId: 'workspace-project' }]);
});

test('launch UI blocks missing, stale, loading and failed workspace selections', async () => {
  for (const options of [{ selected: '' }, { workspaces: [] }, { selected: 'deleted-workspace' }, { loading: true }, { error: 'Registry unavailable' }]) {
    const { tree } = await renderLaunch(options);
    const launch = elements(tree).find(node => node.type === 'button' && node.children[0] === 'launch');
    assert.equal(launch.props.disabled, true);
  }
});
