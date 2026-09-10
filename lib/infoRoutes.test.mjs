import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isObjectIdOrHexString } from 'mongoose';
import { DASHBOARD_INFO_FIELDS, PAGE_INFO_FIELDS, normalizeInfoValues, parseInfoPatch, infoFieldSet } from './infoFields.js';
import { infoResponse } from './infoResponse.js';

const ownerId = '111111111111111111111111';
const otherId = '222222222222222222222222';
const pageId = '333333333333333333333333';
const params = { params: Promise.resolve({ pageId }) };

// Exercise the route bodies with injected auth/database boundaries. These tests
// never load lib/auth or connect to the application's configured Mongo database.
function route(path, overrides = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    .replace(/^import .+;\n/gm, '')
    .replace(/^export /gm, '');
  const bindings = {
    auth: async () => null,
    connectDB: async () => {},
    NextResponse: Response,
    isObjectIdOrHexString,
    DASHBOARD_INFO_FIELDS, PAGE_INFO_FIELDS, normalizeInfoValues, parseInfoPatch, infoResponse,
    ...overrides,
  };
  return new Function(...Object.keys(bindings), `${source}\nreturn { GET, PATCH };`)(...Object.values(bindings));
}

function request(body) {
  return new Request('https://example.test/info', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

test('dashboard GET returns only public info fields and rejects invalid/missing users', async () => {
  const api = route('../app/api/user/dashboard/route.js', {
    User: { findById: id => ({ lean: async () => id === ownerId ? {
      email: 'private@example.test', passwordHash: 'private',
      dashboard: { infoText1: '<h1>Public</h1>', infoMode1: 'html', gridCols: 6, dashHex: '#ffffff' },
    } : null }) },
  });
  const result = await api.GET(new Request(`https://example.test/info?userId=${ownerId}`));
  assert.deepEqual(await result.json(), {
    infoText1: '<h1>Public</h1>', infoMode1: 'html', infoText: '', infoMode: 'text', gridCols: 6,
  });
  for (const id of ['invalid', otherId]) {
    assert.equal((await api.GET(new Request(`https://example.test/info?userId=${id}`))).status, 404);
  }
});

test('private info GET checks ownership even when a conditional request matches', async () => {
  let session = null;
  const api = route('../app/api/pages/[pageId]/meta/route.js', {
    auth: async () => session,
    Page: { findById: () => ({ lean: async () => ({
      userId: ownerId, isPrivate: true, pageMetaData: { infoText1: 'Private text' },
    }) }) },
  });
  const url = `https://example.test/api/pages/${pageId}/meta`;
  assert.equal((await api.GET(new Request(url), params)).status, 404);
  session = { user: { userId: otherId } };
  assert.equal((await api.GET(new Request(url), params)).status, 404);
  session = { user: { userId: ownerId } };
  const allowed = await api.GET(new Request(url), params);
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json()).infoText1, 'Private text');
  const conditional = new Request(url, { headers: { 'If-None-Match': allowed.headers.get('etag') } });
  assert.equal((await api.GET(conditional, params)).status, 304);
  session = null;
  assert.equal((await api.GET(conditional, params)).status, 404);
});

test('public page info is readable without a login and excludes ownership fields', async () => {
  const api = route('../app/api/pages/[pageId]/meta/route.js', {
    Page: { findById: () => ({ lean: async () => ({
      userId: ownerId, isPrivate: false, pageMetaData: { infoMode1: 'html' },
    }) }) },
  });
  const result = await api.GET(new Request('https://example.test/info'), params);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { infoText1: '', infoMode1: 'html', infoText2: '', infoMode: 'text', gridCols: null });
});

test('dashboard PATCH uses the signed-in account and passes only supplied info fields', async () => {
  let session = null;
  const writes = [];
  const api = route('../app/api/user/dashboard/route.js', {
    auth: async () => session,
    updateUserDashboard: async (userId, patch) => {
      writes.push({ userId, patch });
      return { dashboard: { infoText: 'Keep this text', ...patch } };
    },
  });
  assert.equal((await api.PATCH(request({ infoMode1: 'html' }))).status, 401);
  session = { user: { userId: ownerId } };
  const result = await api.PATCH(request({ userId: otherId, infoMode1: 'html' }));
  assert.equal(result.status, 200);
  assert.deepEqual(writes, [{ userId: ownerId, patch: { infoMode1: 'html' } }]);
  assert.equal((await result.json()).infoText, 'Keep this text');
  assert.equal((await api.PATCH(request({ infoText1: null }))).status, 400);
  assert.equal(writes.length, 1);
});

test('page PATCH checks session ownership at the write and reports a missing match', async () => {
  let session = null;
  const writes = [];
  const api = route('../app/api/pages/[pageId]/meta/route.js', {
    auth: async () => session,
    updatePageMeta: async (id, userId, patch) => {
      writes.push({ id, userId, patch });
      return userId === ownerId ? { pageMetaData: patch } : null;
    },
  });
  assert.equal((await api.PATCH(request({ infoMode1: 'html' }), params)).status, 401);
  session = { user: { userId: otherId } };
  assert.equal((await api.PATCH(request({ infoMode1: 'html' }), params)).status, 403);
  session = { user: { userId: ownerId } };
  assert.equal((await api.PATCH(request({ infoMode1: 'html' }), params)).status, 200);
  assert.deepEqual(writes.at(-1), { id: pageId, userId: ownerId, patch: { infoMode1: 'html' } });
  assert.equal((await api.PATCH(request({ infoMode1: 'invalid' }), params)).status, 400);
  assert.equal(writes.length, 2);
});

test('page database update includes the owner in its atomic filter and never replaces other info', async () => {
  const source = readFileSync(new URL('./data.js', import.meta.url), 'utf8');
  const declaration = source.match(/export async function updatePageMeta\([\s\S]*?\n}/)[0].replace('export ', '');
  let write;
  const Page = { findOneAndUpdate: (filter, update, options) => {
    write = { filter, update, options };
    return { select: () => ({ lean: async () => ({ pageMetaData: { infoMode1: 'html' } }) }) };
  } };
  const update = new Function('connectDB', 'Page', 'infoFieldSet', 'PAGE_INFO_FIELDS',
    `${declaration}\nreturn updatePageMeta;`)(async () => {}, Page, infoFieldSet, PAGE_INFO_FIELDS);
  await update(pageId, ownerId, { infoMode1: 'html', gridCols: 6 });
  assert.deepEqual(write.filter, { _id: pageId, userId: ownerId });
  assert.deepEqual(write.update, { $set: { 'pageMetaData.infoMode1': 'html', 'pageMetaData.gridCols': 6 } });
  assert.equal(write.options.runValidators, true);
});
