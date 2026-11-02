import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, PocketBaseError } from '#pocketbase';
import { apiUrl, LOCAL_API, PRODUCTION_API } from '#config';

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
    calls.push({ url: new globalThis.URL(url), method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
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
