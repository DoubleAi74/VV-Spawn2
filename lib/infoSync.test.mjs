import test from 'node:test';
import assert from 'node:assert/strict';
import { createInfoSync, INFO_POLL_MS, INFO_SAVE_MS } from './infoSync.js';
import { DASHBOARD_INFO_FIELDS, PAGE_INFO_FIELDS, normalizeInfoValues } from './infoFields.js';
import { infoResponse } from './infoResponse.js';

const settle = () => new Promise(resolve => setImmediate(resolve));

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function clock() {
  let now = 0;
  let sequence = 0;
  const timers = new Map();
  return {
    setTimer(fn, delay) {
      const id = ++sequence;
      timers.set(id, { fn, at: now + delay });
      return id;
    },
    clearTimer(id) { timers.delete(id); },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
        await settle();
      }
      now = end;
      await settle();
    },
  };
}

function environment(t, fields = DASHBOARD_INFO_FIELDS) {
  const timers = clock();
  let data = normalizeInfoValues({}, fields);
  const writes = [];
  const reads = [];
  const fetcher = async (url, options = {}) => {
    if (options.method === 'PATCH') {
      const patch = JSON.parse(options.body);
      writes.push(patch);
      data = { ...data, ...patch };
      return Response.json(data);
    }
    reads.push(options);
    return infoResponse(new Request(`https://example.test${url}`, { headers: options.headers }), data);
  };
  return {
    timers, writes, reads, fetcher,
    get data() { return data; },
    remote(patch) { data = { ...data, ...patch }; },
    client(options = {}) {
      const sync = createInfoSync({
        fields, initialValues: data, readUrl: '/info', writeUrl: '/info',
        fetcher, ...timers, ...options,
      });
      sync.setCanEdit(options.canEdit !== false);
      sync.start();
      t.after(() => sync.stop());
      return sync;
    },
  };
}

for (const [name, fields] of [['dashboard', DASHBOARD_INFO_FIELDS], ['page', PAGE_INFO_FIELDS]]) {
  test(`${name}: text, both HTML toggles and clearing a box sync to another open session`, async t => {
    const env = environment(t, fields);
    const owner = env.client();
    const other = env.client();
    const visitor = env.client({ canEdit: false });
    await settle();
    for (const { text, mode } of fields) {
      owner.change(text, '<h1>A shared note</h1>');
      owner.change(mode, 'html');
    }
    await env.timers.advance(INFO_SAVE_MS);
    assert.equal(env.writes.length, 1);
    await env.timers.advance(INFO_POLL_MS - INFO_SAVE_MS);
    assert.deepEqual(other.getSnapshot().values, owner.getSnapshot().values);
    assert.deepEqual(visitor.getSnapshot().values, owner.getSnapshot().values);
    assert.deepEqual(other.getSnapshot().pending, []);
    assert.equal(env.writes.length, 1, 'receiving updates must not write them back');

    for (const { text, mode } of fields) {
      owner.change(text, '');
      owner.change(mode, 'text');
    }
    await env.timers.advance(INFO_POLL_MS);
    assert.deepEqual(other.getSnapshot().values, normalizeInfoValues({}, fields));
    assert.equal(env.writes.length, 2);
  });
}

test('simultaneous edits to different fields merge, including text and mode of one box', async t => {
  const env = environment(t);
  const first = env.client();
  const second = env.client();
  await settle();
  first.change('infoText1', 'New upper text');
  second.change('infoMode1', 'html');
  second.change('infoText', 'New lower text');
  await env.timers.advance(INFO_POLL_MS);
  assert.equal(env.data.infoText1, 'New upper text');
  assert.equal(env.data.infoText, 'New lower text');
  assert.equal(env.data.infoMode1, 'html');
  assert.deepEqual(first.getSnapshot().values, env.data);
  assert.deepEqual(second.getSnapshot().values, env.data);
  assert.deepEqual(env.writes[0], { infoText1: 'New upper text' });
  assert.deepEqual(env.writes[1], { infoMode1: 'html', infoText: 'New lower text' });
});

test('a remote update preserves pending typing but updates clean fields immediately', async t => {
  const env = environment(t);
  const client = env.client();
  await settle();
  client.change('infoText1', 'Still typing locally');
  env.remote({ infoText1: 'Remote upper text', infoMode1: 'html', infoText: 'Remote lower text' });
  await client.refresh();
  assert.equal(client.getSnapshot().values.infoText1, 'Still typing locally');
  assert.equal(client.getSnapshot().values.infoMode1, 'html');
  assert.equal(client.getSnapshot().values.infoText, 'Remote lower text');
  await client.save();
  assert.deepEqual(env.writes, [{ infoText1: 'Still typing locally' }]);
  assert.equal(env.data.infoText, 'Remote lower text');
});

test('a delayed acknowledgement cannot replace subsequent edits in either box or mode', async t => {
  const env = environment(t);
  const gate = deferred();
  let writes = 0;
  const client = env.client({ fetcher: async (url, options) => {
    const response = await env.fetcher(url, options);
    if (options.method === 'PATCH' && ++writes === 1) await gate.promise;
    return response;
  } });
  await settle();
  client.change('infoText1', 'Sent upper text');
  client.change('infoMode1', 'html');
  const saving = client.save();
  await settle();
  client.change('infoText1', 'Newer upper text');
  client.change('infoText', 'New lower text');
  client.change('infoMode1', 'text');
  await client.save();
  assert.equal(env.writes.length, 1, 'writes from one session must not overlap');
  gate.resolve();
  await saving;
  assert.equal(client.getSnapshot().values.infoText1, 'Newer upper text');
  assert.equal(client.getSnapshot().values.infoText, 'New lower text');
  assert.equal(client.getSnapshot().values.infoMode1, 'text');
  assert.equal(client.getSnapshot().pending.length, 3);
  await env.timers.advance(0);
  assert.equal(env.writes.length, 2);
  assert.deepEqual(client.getSnapshot().pending, []);
  assert.equal(env.data.infoMode1, 'text', 'a toggle reverted during save must still be saved');
});

test('a read started before a write cannot roll back the saved result', async t => {
  const env = environment(t);
  const gate = deferred();
  const client = env.client({ fetcher: async (url, options) => {
    const response = await env.fetcher(url, options);
    if (options.method !== 'PATCH') await gate.promise;
    return response;
  } });
  client.change('infoMode1', 'html');
  await client.save();
  gate.resolve();
  await settle();
  assert.equal(client.getSnapshot().values.infoMode1, 'html');
  assert.deepEqual(client.getSnapshot().pending, []);
});

test('failed saves retain drafts, ignore remote overwrites and retry after recovery', async t => {
  const env = environment(t);
  let offline = true;
  let persisted;
  const client = env.client({
    onDraftChange: draft => { persisted = draft; },
    fetcher: (url, options) => {
      if (offline && options.method === 'PATCH') throw new Error('Offline');
      return env.fetcher(url, options);
    },
  });
  await settle();
  client.change('infoText', 'Pending work');
  await client.save();
  assert.match(client.getSnapshot().error, /Failed to save/);
  assert.deepEqual(persisted, { infoText: 'Pending work' });
  env.remote({ infoText: 'Different remote text' });
  await client.refresh();
  assert.equal(client.getSnapshot().values.infoText, 'Pending work');
  offline = false;
  await env.timers.advance(5000);
  assert.equal(env.data.infoText, 'Pending work');
  assert.deepEqual(persisted, {});
  assert.equal(client.getSnapshot().error, '');
});

test('pending drafts restore as unsaved and a fresh session honours explicit database modes', async t => {
  const env = environment(t);
  env.remote({ infoText1: '<h1>Fragment</h1>', infoMode1: 'html', infoText: '<!DOCTYPE html>', infoMode: 'text' });
  const client = env.client();
  assert.equal(client.getSnapshot().values.infoMode1, 'html');
  assert.equal(client.getSnapshot().values.infoMode, 'text');
  client.restoreDraft({ infoText1: 'Recovered typing' });
  assert.deepEqual(client.getSnapshot().pending, ['infoText1']);
  await env.timers.advance(INFO_SAVE_MS);
  assert.equal(env.data.infoText1, 'Recovered typing');
  assert.equal(env.data.infoMode1, 'html');
});

test('unchanged reads use conditional requests without publishing updates or writing', async t => {
  const env = environment(t);
  const client = env.client();
  await settle();
  const before = client.getSnapshot();
  await client.refresh();
  assert.ok(env.reads[1].headers['If-None-Match']);
  assert.equal(client.getSnapshot(), before);
  assert.equal(env.writes.length, 0);
});

test('hidden tabs pause reads and can catch up immediately when visible again', async t => {
  const env = environment(t);
  let visible = false;
  const client = env.client({ shouldPoll: () => visible });
  await env.timers.advance(INFO_POLL_MS * 2);
  assert.equal(env.reads.length, 0);
  env.remote({ infoMode1: 'html' });
  visible = true;
  await client.refresh();
  assert.equal(client.getSnapshot().values.infoMode1, 'html');
});

test('read-only viewers cannot save or restore an owner draft', async t => {
  const env = environment(t);
  const client = env.client({ canEdit: false });
  client.change('infoMode1', 'html');
  client.restoreDraft({ infoMode1: 'html' });
  await client.save();
  await env.timers.advance(INFO_POLL_MS);
  assert.equal(env.writes.length, 0);
  assert.deepEqual(client.getSnapshot().pending, []);
});

test('stopping a session cancels polling and ignores old reads after a restart', async t => {
  const env = environment(t);
  const gate = deferred();
  let first = true;
  const client = env.client({ fetcher: async (url, options) => {
    const response = await env.fetcher(url, options);
    if (first) { first = false; await gate.promise; }
    return response;
  } });
  client.stop();
  env.remote({ infoMode1: 'html' });
  client.start();
  await settle();
  gate.resolve();
  await settle();
  assert.equal(client.getSnapshot().values.infoMode1, 'html');
  client.stop();
  const reads = env.reads.length;
  await env.timers.advance(INFO_POLL_MS * 2);
  assert.equal(env.reads.length, reads);
});
