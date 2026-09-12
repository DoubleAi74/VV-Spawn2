import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardListStore, getCardListStore } from './cardListCache.js';
import {
  getDashboardSnapshot, getPageSnapshot, setDashboardSnapshot, setPageSnapshot,
  updateSnapshotCards,
} from './routeTransitionCache.js';

const rows = (...ids) => ids.map((_id, index) => ({ _id, order_index: index + 1, content: `Full ${_id}` }));
const ids = store => store.getItems().map(item => item._id);
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

for (const kind of ['dashboard', 'page']) {
  test(`${kind}: a cached route cannot undo a saved create or delete`, async () => {
    const oldRoute = rows('a', 'b');
    let server = oldRoute;
    const key = `return:${kind}`;
    const { store } = getCardListStore(key, oldRoute, { read: async () => server });
    const endCreate = store.beginMutation();
    store.setItems(items => [...items, { _id: 'temp', _optimistic: true }]);
    server = rows('a', 'b', 'c');
    store.setItems(items => items.map(item => item._id === 'temp' ? server[2] : item));
    await endCreate();

    assert.deepEqual(ids(getCardListStore(key, oldRoute).store), ['a', 'b', 'c']);
    const endDelete = store.beginMutation();
    store.setItems(items => items.filter(item => item._id !== 'a'));
    server = rows('b', 'c');
    await endDelete();
    const returned = getCardListStore(key, oldRoute);
    assert.equal(returned.reused, true);
    assert.deepEqual(ids(returned.store), ['b', 'c']);
    assert.equal(returned.store.getItems()[1].content, 'Full c');
  });
}

test('a save that completes after unmount updates both returning views and loading cards', async () => {
  const tag = 'pending-post-test';
  setPageSnapshot(tag, 'one', { isOwner: true, gridCols: 3, posts: rows('a') });
  const { store } = getCardListStore(tag, rows('a'), {
    onChange: items => updateSnapshotCards(tag, 'one', items, true),
  });
  let renders = 0;
  const unmount = store.subscribe(() => { renders += 1; });
  const finish = store.beginMutation();
  store.setItems(items => [...items, { _id: 'temp', _optimistic: true }]);
  unmount();
  const renderedBeforeLeaving = renders;
  // The old view's setter remains connected to the shared list after unmount.
  store.setItems(items => items.map(item => item._id === 'temp' ? rows('created')[0] : item));
  await finish();
  assert.equal(renders, renderedBeforeLeaving);
  assert.deepEqual(getPageSnapshot(tag, 'one').posts.map(item => item._id), ['a', 'created']);
  assert.equal(getPageSnapshot(tag, 'one').gridCols, 3);
  assert.deepEqual(ids(getCardListStore(tag, rows('a')).store), ['a', 'created']);
});

test('a failed delete restores the card after navigation, including the loading snapshot', async () => {
  const tag = 'failed-delete-test';
  const original = rows('a');
  setDashboardSnapshot(tag, { isOwner: true, gridCols: 4, pages: original });
  const store = createCardListStore(original, {
    onChange: items => updateSnapshotCards(tag, '', items, true),
    read: async () => { throw new Error('offline'); },
  });
  const finish = store.beginMutation();
  store.setItems([]);
  assert.deepEqual(getDashboardSnapshot(tag).pages, []);
  store.setItems(original);
  await finish();
  assert.deepEqual(ids(store), ['a']);
  assert.deepEqual(getDashboardSnapshot(tag).pages.map(item => item._id), ['a']);
});

test('a read started before a mutation cannot replace its newer result', async () => {
  const oldRead = deferred();
  let readCount = 0;
  const store = createCardListStore(rows('deleted'), {
    read: () => ++readCount === 1 ? oldRead.promise : Promise.resolve(rows('created')),
  });
  const refresh = store.refresh();
  const finish = store.beginMutation();
  store.setItems(rows('created'));
  await finish();
  oldRead.resolve(rows('deleted'));
  assert.equal(await refresh, false);
  assert.deepEqual(ids(store), ['created']);
});

test('returning during pending saves defers reconciliation until all saves settle', async () => {
  let reads = 0;
  const store = createCardListStore([], { read: async () => { reads += 1; return rows('a', 'b'); } });
  const finishA = store.beginMutation();
  const finishB = store.beginMutation();
  store.setItems([{ _id: 'temp-a', _optimistic: true }, { _id: 'temp-b', _optimistic: true }]);
  assert.equal(await store.refresh(), false);
  assert.equal(reads, 0);
  store.setItems(items => items.map(item => item._id === 'temp-a' ? rows('a')[0] : item));
  await finishA();
  assert.equal(reads, 0);
  assert.equal(store.getSnapshot().pending, 1);
  store.setItems(rows('a', 'b'));
  await finishB();
  assert.equal(reads, 1);
  assert.equal(store.getSnapshot().pending, 0);
});

test('fresh reads accept remote additions and deletions, including an empty list', async () => {
  let server = rows('remote');
  const store = createCardListStore(rows('old'), { read: async () => server });
  await store.refresh();
  assert.deepEqual(ids(store), ['remote']);
  server = [];
  await store.refresh();
  assert.deepEqual(ids(store), []);
});

test('an out-of-order background read cannot replace the latest read', async () => {
  const older = deferred();
  let requests = 0;
  const store = createCardListStore([], { read: () => ++requests === 1 ? older.promise : rows('new') });
  const first = store.refresh();
  await store.refresh();
  older.resolve(rows('old'));
  assert.equal(await first, false);
  assert.deepEqual(ids(store), ['new']);
});

test('full lists and post content survive return beyond the loading preview limits', () => {
  const tag = 'large-list-test';
  setPageSnapshot(tag, 'one', { isOwner: true, posts: [] });
  const full = rows(...Array.from({ length: 45 }, (_, i) => `p${i}`));
  const { store } = getCardListStore(tag, [], {
    onChange: items => updateSnapshotCards(tag, 'one', items, true),
  });
  store.setItems(full);
  assert.equal(getPageSnapshot(tag, 'one').posts.length, 30);
  assert.equal(getPageSnapshot(tag, 'one').posts[0].content, undefined);
  const returned = getCardListStore(tag, []).store;
  assert.equal(returned.getItems().length, 45);
  assert.equal(returned.getItems()[44].content, 'Full p44');
});

test('a departed owner cannot overwrite a visitor loading snapshot', () => {
  const tag = 'role-test';
  setDashboardSnapshot(tag, { isOwner: false, pages: rows('public') });
  updateSnapshotCards(tag, '', [{ _id: 'private', isPrivate: true }], true);
  assert.deepEqual(getDashboardSnapshot(tag).pages.map(item => item._id), ['public']);
  updateSnapshotCards(tag, '', [{ _id: 'private', isPrivate: true }, { _id: 'visible' }], false);
  assert.deepEqual(getDashboardSnapshot(tag).pages.map(item => item._id), ['visible']);
});
