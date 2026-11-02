import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, PocketBaseError } from '#pocketbase';
import { apiUrl, LOCAL_API, PRODUCTION_API } from '#config';
import { mergeFields } from '#sync';

const URL_ = 'https://pb.test';
const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
const userRecord = { id: 'user1', email: 'a@b.c', name: 'Ana' };
const auth = reply(200, { token: 'T', record: { ...userRecord, extra: 1 } });
// The access row of the user for this app (ACC-3); no status: no row.
const access = (status) => reply(200, { items: status ? [{ id: 'acc1', user: 'user1', app: 'app1', status }] : [], page: 1, totalPages: status ? 1 : 0 });
const app = reply(200, { items: [{ id: 'app1', slug: 'maney' }] });
const unique = reply(400, { data: { user: { code: 'validation_not_unique' }, app: { code: 'validation_not_unique' } } });
const methods = reply(200, {
  oauth2: { providers: [{ name: 'github', authURL: 'x' }, { name: 'google', state: 'S', codeVerifier: 'V', authURL: 'https://g.test/auth?redirect_uri=' }] },
});
const PENDING = { provider: 'google', state: 'S', codeVerifier: 'V' };

// A fake fetch that records each request and answers from a list of replies, in order.
const fake = (...replies) => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: new globalThis.URL(url), method: init.method, headers: init.headers, body: init.body instanceof FormData ? init.body : init.body ? JSON.parse(init.body) : undefined });
    const next = replies.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, client: createClient({ url: `${URL_}/`, fetch }) };
};

test('apiUrl gives the local server on a local host and the production one elsewhere', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) assert.equal(apiUrl(host), LOCAL_API);
  assert.equal(apiUrl('gekyzo.github.io'), PRODUCTION_API);
});

test('oauthStart appends the encoded redirect URL to the authURL of google', async () => {
  const { calls, client } = fake(methods);
  const started = await client.oauthStart('https://app.test/x?a=1');
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url.href, 'https://pb.test/api/collections/users/auth-methods');
  assert.equal(started.url, 'https://g.test/auth?redirect_uri=https%3A%2F%2Fapp.test%2Fx%3Fa%3D1');
  assert.deepEqual(started.pending, PENDING);
});

test('oauthStart without a google provider is an invalid error', async () => {
  const { client } = fake(reply(200, { oauth2: { providers: [] } }));
  await assert.rejects(client.oauthStart('u'), { type: 'invalid' });
});

test('oauthFinish refuses a state that is not the one sent, with no request', async () => {
  const { calls, client } = fake();
  await assert.rejects(client.oauthFinish({ code: 'C', state: 'other' }, PENDING, 'u'), { type: 'state' });
  assert.equal(calls.length, 0);
});

test('oauthFinish exchanges the code and reads the approved access row of the app', async () => {
  const { calls, client } = fake(auth, access('approved'));
  const session = await client.oauthFinish({ code: 'C', state: 'S' }, PENDING, 'https://app.test/');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url.pathname, '/api/collections/users/auth-with-oauth2');
  assert.deepEqual(calls[0].body, { provider: 'google', code: 'C', codeVerifier: 'V', redirectURL: 'https://app.test/' });
  assert.equal(calls[1].url.pathname, '/api/collections/app_access/records');
  assert.equal(calls[1].url.searchParams.get('filter'), 'user = "user1" && app.slug = "maney"');
  assert.equal(calls[1].headers.Authorization, 'T');
  assert.deepEqual(session, { token: 'T', user: { ...userRecord, approved: true } });
});

test('a pending or revoked row is not approved', async () => {
  for (const status of ['pending', 'revoked']) {
    const { client } = fake(auth, access(status));
    const session = await client.oauthFinish({ code: 'C', state: 'S' }, PENDING, 'u');
    assert.equal(session.user.approved, false, status);
  }
});

test('with no access row, a sign-in asks for access with a pending row (ACC-3)', async () => {
  const { calls, client } = fake(auth, access(null), app, reply(200, { id: 'acc1', status: 'pending' }));
  const session = await client.oauthFinish({ code: 'C', state: 'S' }, PENDING, 'u');
  assert.equal(calls[2].url.searchParams.get('filter'), 'slug = "maney"');
  assert.equal(calls[3].method, 'POST');
  assert.deepEqual(calls[3].body, { user: 'user1', app: 'app1', status: 'pending' });
  assert.equal(session.user.approved, false);
});

test('a duplicate access row made meanwhile is read again', async () => {
  const { client } = fake(auth, access(null), app, unique, access('approved'));
  const session = await client.oauthFinish({ code: 'C', state: 'S' }, PENDING, 'u');
  assert.equal(session.user.approved, true);
});

test('an app that the server does not list is an invalid error', async () => {
  const { client } = fake(auth, access(null), reply(200, { items: [] }));
  await assert.rejects(client.oauthFinish({ code: 'C', state: 'S' }, PENDING, 'u'), { type: 'invalid', status: 404 });
});

test('refresh posts the token and reads the access row again', async () => {
  const { calls, client } = fake(reply(200, { token: 'T2', record: userRecord }), access('revoked'));
  const session = await client.refresh('T');
  assert.equal(calls[0].url.pathname, '/api/collections/users/auth-refresh');
  assert.equal(calls[0].headers.Authorization, 'T');
  assert.deepEqual(session, { token: 'T2', user: { ...userRecord, approved: false } });
});

test('the errors have a type: network, auth, rate, server', async () => {
  const cases = [
    [new TypeError('offline'), 'network'],
    [reply(401, {}), 'auth'],
    [reply(403, {}), 'auth'],
    [reply(429, {}), 'rate'],
    [reply(500, {}), 'server'],
  ];
  for (const [answer, type] of cases) {
    const { client } = fake(answer);
    await assert.rejects(client.refresh('T'), (error) => error instanceof PocketBaseError && error.type === type);
  }
});

test('a body that is not JSON is a server error', async () => {
  const { client } = fake({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } });
  await assert.rejects(client.refresh('T'), { type: 'server' });
});

// The records (SYNC-4).
const rec = (over = {}) => ({ id: 'r1', kind: 'todo', key: 't1', data: { text: 'Pay' }, deleted: false, updated: '2026-01-01 00:00:00.000Z', ...over });
const page = (items, totalPages = 1) => reply(200, { items, page: 1, totalPages });
const upsert = { op: 'upsert', kind: 'todo', key: 't1', data: { text: 'Pay' } };
const remove = { op: 'delete', kind: 'todo', key: 't1' };
const known = { updated: '2026-01-01 00:00:00.000Z', data: { text: 'Pay' } };

test('pull sends the owner and cursor filter and walks every page sorted by updated (SYNC-4)', async () => {
  const { calls, client } = fake(page([rec({ id: 'a' })], 2), page([rec({ id: 'b' })], 2));
  const records = await client.pull('T', '2026-01-01 00:00:00.000Z', 'u1');
  assert.deepEqual(records.map(({ id }) => id), ['a', 'b']);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.pathname, '/api/collections/maney_records/records');
  assert.equal(calls[0].url.searchParams.get('filter'), 'owner = "u1" && updated >= "2026-01-01 00:00:00.000Z"');
  assert.equal(calls[0].url.searchParams.get('sort'), 'updated,id');
  assert.equal(calls[0].url.searchParams.get('perPage'), '200');
  assert.deepEqual([calls[0].url.searchParams.get('page'), calls[1].url.searchParams.get('page')], ['1', '2']);
  assert.equal(calls[0].headers.Authorization, 'T');
});

test('pull with no cursor filters by owner only and keeps the fields of a record (SYNC-4)', async () => {
  const { calls, client } = fake(page([{ ...rec(), owner: 'u1', extra: 1, deleted: undefined }]));
  const [first] = await client.pull('T', '', 'u1');
  assert.equal(calls[0].url.searchParams.get('filter'), 'owner = "u1"');
  assert.deepEqual(first, rec({ deleted: false }));
});

test('pull and push without an owner throw an auth error with no request (SYNC-4)', async () => {
  const { calls, client } = fake();
  await assert.rejects(client.pull('T', '', ''), { type: 'auth' });
  await assert.rejects(client.push('T', upsert, '', null), { type: 'auth' });
  assert.equal(calls.length, 0);
});

test('push with the known updated patches the change as it is', async () => {
  const { calls, client } = fake(page([rec()]), reply(200, rec({ data: { text: 'New' } })));
  const result = await client.push('T', { ...upsert, data: { text: 'New' } }, 'u1', known);
  assert.equal(calls[0].url.searchParams.get('filter'), 'owner = "u1" && kind = "todo" && key = "t1"');
  assert.equal(calls[1].method, 'PATCH');
  assert.equal(calls[1].url.pathname, '/api/collections/maney_records/records/r1');
  assert.deepEqual(calls[1].body, { deleted: false, data: { text: 'New' } });
  assert.deepEqual(result, { rec: rec({ data: { text: 'New' } }), overruled: [] });
});

test('push of a change whose record moved on the server patches the merged data', async () => {
  const baseData = { text: 'a', due: null, done: false, doneAt: null };
  const found = rec({ updated: '2026-11-02 10:00:01.000Z', data: { ...baseData, done: true, doneAt: '2026-11-02T10:00:01Z' } });
  const change = { ...upsert, data: { ...baseData, text: 'b' } };
  const merged = mergeFields(found.data, baseData, change.data).data;
  const { calls, client } = fake(page([found]), reply(200, rec({ data: merged })));
  const result = await client.push('T', change, 'u1', { updated: '2026-11-02 10:00:00.000Z', data: baseData });
  assert.deepEqual(calls.map(({ method }) => method), ['GET', 'PATCH']);
  assert.deepEqual(calls[1].body, { deleted: false, data: merged });
  assert.deepEqual(calls[1].body.data, { text: 'b', due: null, done: true, doneAt: '2026-11-02T10:00:01Z' });
  assert.deepEqual(result.overruled, []);
});

test('push of a field changed on both sides keeps the server value and names it overruled (SYNC-4)', async () => {
  const { calls, client } = fake(page([rec({ updated: '2026-01-02 00:00:00.000Z', data: { text: 'Theirs' } })]), reply(200, rec({ data: { text: 'Theirs' } })));
  const result = await client.push('T', { ...upsert, data: { text: 'Mine' } }, 'u1', known);
  assert.deepEqual(calls[1].body, { deleted: false, data: { text: 'Theirs' } });
  assert.deepEqual(result.overruled, ['text']);
});

test('push of a found record with base null patches the change as it is (SYNC-4, SYNC-8)', async () => {
  const { calls, client } = fake(page([rec({ updated: '2026-05-01 00:00:00.000Z', data: { text: 'Theirs', done: true } })]), reply(200, rec({ data: { text: 'Mine' } })));
  const result = await client.push('T', { ...upsert, data: { text: 'Mine' } }, 'u1', null);
  assert.deepEqual(calls.map(({ method }) => method), ['GET', 'PATCH']);
  assert.deepEqual(calls[1].body, { deleted: false, data: { text: 'Mine' } });
  assert.deepEqual(result.overruled, []);
});

test('push of an upsert on a tombstoned record patches deleted false with the data (SYNC-4)', async () => {
  const { calls, client } = fake(page([rec({ deleted: true })]), reply(200, rec()));
  const result = await client.push('T', upsert, 'u1', known);
  assert.deepEqual(calls[1].body, { deleted: false, data: { text: 'Pay' } });
  assert.equal(result.rec.deleted, false);
});

test('push of a delete patches deleted true whatever the updated', async () => {
  for (const base of [known, { ...known, updated: '2025-01-01 00:00:00.000Z' }, null]) {
    const { calls, client } = fake(page([rec({ updated: '2026-03-01 00:00:00.000Z' })]), reply(200, rec({ deleted: true })));
    const result = await client.push('T', { ...remove, photo: null }, 'u1', base);
    assert.deepEqual(calls[1].body, { deleted: true });
    assert.deepEqual(result, { rec: rec({ deleted: true }), overruled: [] });
  }
});

test('push of a delete with no record gives no record and posts nothing (SYNC-4)', async () => {
  const { calls, client } = fake(page([]));
  assert.deepEqual(await client.push('T', remove, 'u1', null), { rec: null, overruled: [] });
  assert.equal(calls.length, 1);
});

test('push of a new record with base null posts it', async () => {
  const { calls, client } = fake(page([]), reply(200, rec()));
  const result = await client.push('T', upsert, 'u1', null);
  assert.equal(result.rec.id, 'r1');
  assert.deepEqual(result.overruled, []);
  assert.equal(calls[1].method, 'POST');
  assert.deepEqual(calls[1].body, { owner: 'u1', kind: 'todo', key: 't1', deleted: false, data: { text: 'Pay' } });
});

test('push whose post is a duplicate finds the record again and patches it (SYNC-4)', async () => {
  const { calls, client } = fake(page([]), unique, page([rec()]), reply(200, rec()));
  await client.push('T', upsert, 'u1', null);
  assert.deepEqual(calls.map(({ method }) => method), ['GET', 'POST', 'GET', 'PATCH']);
});

test('push whose post fails for another reason rethrows it (SYNC-4)', async () => {
  const { calls, client } = fake(page([]), reply(400, {}));
  await assert.rejects(client.push('T', upsert, 'u1', null), { type: 'invalid' });
  assert.equal(calls.length, 2);
});

test('push whose duplicate post finds nothing rethrows the duplicate (SYNC-4)', async () => {
  const { client } = fake(page([]), unique, page([]));
  await assert.rejects(client.push('T', upsert, 'u1', null), { status: 400 });
});

// A fake EventSource: the test fires its events.
const stream = () => {
  const sources = [];
  class EventSource {
    constructor(url) {
      this.url = url;
      this.handlers = {};
      this.closed = false;
      sources.push(this);
    }
    addEventListener(name, handler) { this.handlers[name] = handler; }
    close() { this.closed = true; }
  }
  return { sources, EventSource };
};

test('subscribe posts the subscription with the current token at each connect and reports a reconnect (SYNC-4)', async () => {
  const { sources, EventSource } = stream();
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url: new globalThis.URL(url), body: JSON.parse(init.body), headers: init.headers }); return { ok: true, status: 204, json: async () => { throw new SyntaxError('x'); } }; };
  const client = createClient({ url: URL_, fetch, EventSource });
  let token = 'T1';
  let reconnects = 0;
  const close = client.subscribe(() => token, () => {}, { onReconnect: () => { reconnects += 1; } });
  assert.equal(sources[0].url, `${URL_}/api/realtime`);
  await sources[0].handlers.PB_CONNECT({ data: '{"clientId":"c1"}' });
  assert.equal(reconnects, 0);
  assert.deepEqual(calls[0].body, { clientId: 'c1', subscriptions: ['maney_records'] });
  assert.equal(calls[0].headers.Authorization, 'T1');
  token = 'T2';
  await sources[0].handlers.PB_CONNECT({ data: '{"clientId":"c2"}' });
  assert.equal(reconnects, 1);
  assert.equal(calls[1].headers.Authorization, 'T2');
  close();
  assert.equal(sources[0].closed, true);
});

test('subscribe gives a record, a delete action as deleted true, and drops a malformed event (SYNC-4)', () => {
  const { sources, EventSource } = stream();
  const client = createClient({ url: URL_, fetch: async () => reply(204, null), EventSource });
  const got = [];
  client.subscribe('T', (record) => got.push(record));
  const fire = sources[0].handlers.maney_records;
  fire({ data: JSON.stringify({ action: 'update', record: { ...rec(), owner: 'u1' } }) });
  fire({ data: JSON.stringify({ action: 'delete', record: rec() }) });
  fire({ data: 'not json' });
  assert.deepEqual(got, [rec(), rec({ deleted: true })]);
});

test('subscribe survives a failed subscription post (SYNC-4)', async () => {
  const { sources, EventSource } = stream();
  const client = createClient({ url: URL_, fetch: async () => { throw new Error('offline'); }, EventSource });
  client.subscribe('T', () => {});
  await sources[0].handlers.PB_CONNECT({ data: '{"clientId":"c1"}' });
});

// The photos of `maney_files` (SYNC-14).
const fileRec = (over = {}) => ({ id: 'f1', owner: 'u1', key: 'p1', photo: 'p1_abc.jpg', deleted: false, ...over });
const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
const FILES_PATH = '/api/collections/maney_files/records';

test('uploadPhoto posts multipart owner, key and photo with no Content-Type', async () => {
  const { calls, client } = fake(page([]), reply(200, fileRec()));
  const result = await client.uploadPhoto('T', { key: 'p1', blob: jpeg() }, 'u1');
  assert.deepEqual(result, { id: 'f1', key: 'p1', photo: 'p1_abc.jpg' });
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url.pathname, FILES_PATH);
  assert.equal(calls[0].url.searchParams.get('filter'), 'owner = "u1" && key = "p1"');
  assert.equal(calls[1].method, 'POST');
  assert.equal(calls[1].url.pathname, FILES_PATH);
  assert.equal(calls[1].headers.Authorization, 'T');
  assert.equal(calls[1].headers['Content-Type'], undefined);
  const form = calls[1].body;
  assert.ok(form instanceof FormData);
  assert.equal(form.get('owner'), 'u1');
  assert.equal(form.get('key'), 'p1');
  const photo = form.get('photo');
  assert.ok(photo instanceof Blob);
  assert.equal(photo.type, 'image/jpeg');
  assert.equal(photo.size, 4);
});

test('uploadPhoto finds a file whose answer was lost and patches it', async () => {
  const { calls, client } = fake(page([fileRec({ deleted: true })]), reply(200, fileRec()));
  const result = await client.uploadPhoto('T', { key: 'p1', blob: jpeg() }, 'u1');
  assert.equal(result.id, 'f1');
  assert.deepEqual(calls.map(({ method }) => method), ['GET', 'PATCH']);
  assert.equal(calls[1].url.pathname, `${FILES_PATH}/f1`);
  assert.equal(calls[1].headers['Content-Type'], undefined);
  assert.equal(calls[1].body.get('deleted'), 'false');
  assert.equal(calls[1].body.get('photo').type, 'image/jpeg');
});

test('uploadPhoto whose post is a duplicate finds the file and patches it', async () => {
  const dup = reply(400, { data: { key: { code: 'validation_not_unique' } } });
  const { calls, client } = fake(page([]), dup, page([fileRec()]), reply(200, fileRec()));
  await client.uploadPhoto('T', { key: 'p1', blob: jpeg() }, 'u1');
  assert.deepEqual(calls.map(({ method }) => method), ['GET', 'POST', 'GET', 'PATCH']);
  assert.equal(calls[3].body.get('deleted'), 'false');
});

test('uploadPhoto rethrows a refused photo with its field errors (SYNC-16)', async () => {
  const { client } = fake(page([]), reply(400, { data: { photo: { code: 'validation_invalid_mime_type' } } }));
  await assert.rejects(client.uploadPhoto('T', { key: 'p1', blob: jpeg() }, 'u1'), (error) => error.type === 'invalid' && Boolean(error.fields.photo));
});

test('fileToken posts /api/files/token and gives its token', async () => {
  const { calls, client } = fake(reply(200, { token: 'FT' }));
  assert.equal(await client.fileToken('T'), 'FT');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url.href, 'https://pb.test/api/files/token');
  assert.equal(calls[0].headers.Authorization, 'T');
});

test('photoUrl builds /api/files/maney_files/<id>/<photo>?token=<fileToken>', () => {
  const { client } = fake();
  assert.equal(client.photoUrl({ id: 'f1', photo: 'p1_abc.jpg' }, 'FT'), 'https://pb.test/api/files/maney_files/f1/p1_abc.jpg?token=FT');
});

test('findPhoto and deletePhoto name the owner, and with no owner throw auth with no request', async () => {
  const { calls, client } = fake(page([fileRec()]), page([fileRec()]), reply(200, fileRec({ deleted: true })), page([]));
  assert.deepEqual(await client.findPhoto('T', 'p1', 'u1'), { id: 'f1', key: 'p1', photo: 'p1_abc.jpg', deleted: false });
  assert.equal(calls[0].url.searchParams.get('filter'), 'owner = "u1" && key = "p1"');
  assert.equal((await client.deletePhoto('T', 'p1', 'u1')).deleted, true);
  assert.equal(calls[2].method, 'PATCH');
  assert.equal(calls[2].url.pathname, `${FILES_PATH}/f1`);
  assert.deepEqual(calls[2].body, { deleted: true });
  assert.equal(await client.deletePhoto('T', 'p9', 'u1'), null);
  const before = calls.length;
  await assert.rejects(client.findPhoto('T', 'p1', ''), { type: 'auth' });
  await assert.rejects(client.deletePhoto('T', 'p1', ''), { type: 'auth' });
  await assert.rejects(client.uploadPhoto('T', { key: 'p1', blob: jpeg() }, ''), { type: 'auth' });
  assert.equal(calls.length, before);
});
