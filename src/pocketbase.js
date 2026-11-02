// The client of the PocketBase server (ACC-3, ACC-4, ACC-6, SYNC-4, SYNC-14, SYNC-15). `fetch` and `EventSource` are injected, so a
// test runs with no network. No SDK: the app calls the REST API of PocketBase directly.
import { APP_SLUG } from '#config';
import { mergeFields } from '#sync';

const USERS = '/api/collections/users';
const ACCESS = '/api/collections/app_access/records';
const APPS = '/api/collections/apps/records';
const RECORDS = '/api/collections/maney_records/records';
export const FILES = '/api/collections/maney_files/records';
const PAGE = 200;

export class PocketBaseError extends Error {
  constructor(type, status = 0, fields = {}) {
    super(`PocketBase ${type} (${status})`);
    this.type = type;
    this.status = status;
    this.fields = fields;
  }
}

const typeOf = (status) => {
  if (status === 401 || status === 403) return 'auth';
  if (status === 400 || status === 404) return 'invalid';
  // The server limits the rate of requests: the request is fine, and it is worth a retry soon.
  if (status === 429) return 'rate';
  return 'server';
};

// PocketBase answers a duplicate row with a 400 whose field errors carry this code.
const isUniqueViolation = (error) =>
  error instanceof PocketBaseError &&
  error.status === 400 &&
  Object.values(error.fields).some((field) => field?.code === 'validation_not_unique');

const quoted = (text) => `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

// `approved` is the access row of this app (ACC-3), not a field of the user.
const sessionOf = ({ token, record }, approved) => ({
  token,
  user: { id: record.id, email: record.email, name: record.name ?? '', approved },
});

const serverRecOf = ({ id, kind, key, data, deleted, updated }) => ({ id, kind, key, data, deleted: deleted === true, updated });

const fileRecOf = ({ id, key, photo, deleted }) => ({ id, key, photo, deleted: deleted === true });
const uploadedOf = ({ id, key, photo }) => ({ id, key, photo });

// Every request for records names the owner.
const ownedBy = (owner) => {
  if (!owner) throw new PocketBaseError('auth');
  return `owner = ${quoted(owner)}`;
};

export const createClient = ({ url, fetch, EventSource }) => {
  const base = url.replace(/\/+$/, '');

  // A `form` (FormData) goes as multipart: the browser sets its Content-Type with the boundary.
  const call = async (method, path, { token, body, query, form } = {}) => {
    let response;
    try {
      response = await fetch(`${base}${path}${query ? `?${new URLSearchParams(query)}` : ''}`, {
        method,
        cache: 'no-store',
        headers: {
          ...(token ? { Authorization: token } : {}),
          ...(body === undefined || form ? {} : { 'Content-Type': 'application/json' }),
        },
        body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
      });
    } catch {
      throw new PocketBaseError('network');
    }
    let json = null;
    try {
      json = await response.json();
    } catch {
      // An empty body (204) or a body that is not JSON.
    }
    if (!response.ok) throw new PocketBaseError(typeOf(response.status), response.status, json?.data ?? {});
    if (json === null && response.status !== 204) throw new PocketBaseError('server', response.status);
    return json;
  };

  const findAccess = async (token, userId) => (await call('GET', ACCESS, {
    token,
    query: { filter: `user = ${quoted(userId)} && app.slug = ${quoted(APP_SLUG)}`, perPage: '1' },
  })).items[0] ?? null;

  // ACC-3: with no row, signing in asks for access with a pending row. A row made meanwhile by
  // another device (a duplicate) is read again.
  const accessOf = async (token, userId) => {
    const found = await findAccess(token, userId);
    if (found) return found.status;
    const app = (await call('GET', APPS, { token, query: { filter: `slug = ${quoted(APP_SLUG)}`, perPage: '1' } })).items[0];
    if (!app) throw new PocketBaseError('invalid', 404);
    try {
      return (await call('POST', ACCESS, { token, body: { user: userId, app: app.id, status: 'pending' } })).status;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return (await findAccess(token, userId))?.status ?? 'pending';
    }
  };

  const withAccess = async (auth) => sessionOf(auth, (await accessOf(auth.token, auth.record.id)) === 'approved');

  const findRecord = async (token, { kind, key }, owner) => {
    const found = await call('GET', RECORDS, {
      token,
      query: { filter: `${ownedBy(owner)} && kind = ${quoted(kind)} && key = ${quoted(key)}`, perPage: '1' },
    });
    return found.items[0] ? serverRecOf(found.items[0]) : null;
  };

  const patch = async (token, id, body) => serverRecOf(await call('PATCH', `${RECORDS}/${id}`, { token, body }));

  // A tombstone keeps its data, so a delete changes only the flag.
  const bodyOf = ({ op, data }) => (op === 'delete' ? { deleted: true } : { deleted: false, data });

  // A duplicate create means another device made the record meanwhile: patch that one.
  const create = async (token, change, owner) => {
    try {
      return serverRecOf(
        await call('POST', RECORDS, { token, body: { owner, kind: change.kind, key: change.key, ...bodyOf(change) } }),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const found = await findRecord(token, change, owner);
      if (!found) throw error;
      return patch(token, found.id, bodyOf(change));
    }
  };

  // The photos of `maney_files` (SYNC-14, SYNC-15).
  const findPhoto = async (token, key, owner) => {
    const found = await call('GET', FILES, { token, query: { filter: `${ownedBy(owner)} && key = ${quoted(key)}`, perPage: '1' } });
    return found.items[0] ? fileRecOf(found.items[0]) : null;
  };

  const photoForm = (blob, key, fields) => {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.append(name, value);
    form.append('photo', blob, `${key}.jpg`);
    return form;
  };

  const patchPhoto = async (token, id, { key, blob }) =>
    uploadedOf(await call('PATCH', `${FILES}/${id}`, { token, form: photoForm(blob, key, { deleted: 'false' }) }));

  return {
    // SYNC-14: a file that the server holds already (an answer lost on the way back, or another
    // device) gets the photo again, and a tombstone comes back; else a new record. A duplicate
    // create finds the record and patches it.
    uploadPhoto: async (token, photo, owner) => {
      const found = await findPhoto(token, photo.key, owner);
      if (found) return patchPhoto(token, found.id, photo);
      try {
        return uploadedOf(await call('POST', FILES, { token, form: photoForm(photo.blob, photo.key, { owner, key: photo.key, deleted: 'false' }) }));
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const again = await findPhoto(token, photo.key, owner);
        if (!again) throw error;
        return patchPhoto(token, again.id, photo);
      }
    },

    findPhoto,

    // SYNC-15: a tombstone keeps the file; null when the server has no such file.
    deletePhoto: async (token, key, owner) => {
      const found = await findPhoto(token, key, owner);
      if (!found) return null;
      return fileRecOf(await call('PATCH', `${FILES}/${found.id}`, { token, body: { deleted: true } }));
    },

    // REC-9: the bytes of a protected file need a file token, which the server gives for a short time.
    fileToken: async (token) => (await call('POST', '/api/files/token', { token })).token,

    photoUrl: ({ id, photo }, fileToken) =>
      `${base}/api/files/maney_files/${encodeURIComponent(id)}/${encodeURIComponent(photo)}?${new URLSearchParams({ token: fileToken })}`,

    oauthStart: async (redirectUrl) => {
      const methods = await call('GET', `${USERS}/auth-methods`);
      const provider = methods.oauth2?.providers?.find(({ name }) => name === 'google');
      if (!provider) throw new PocketBaseError('invalid', 404);
      return {
        url: provider.authURL + encodeURIComponent(redirectUrl),
        pending: { provider: provider.name, state: provider.state, codeVerifier: provider.codeVerifier },
      };
    },

    // The body carries no createData: access is a row of its own (ACC-3).
    oauthFinish: async ({ code, state }, pending, redirectUrl) => {
      if (state !== pending.state) throw new PocketBaseError('state');
      return withAccess(
        await call('POST', `${USERS}/auth-with-oauth2`, {
          body: { provider: pending.provider, code, codeVerifier: pending.codeVerifier, redirectURL: redirectUrl },
        }),
      );
    },

    refresh: async (token) => withAccess(await call('POST', `${USERS}/auth-refresh`, { token })),

    // SYNC-4: every record of the owner with `updated` at or after the cursor, page by page. An empty
    // cursor pulls all of them.
    pull: async (token, since, owner) => {
      const filter = since ? `${ownedBy(owner)} && updated >= ${quoted(since)}` : ownedBy(owner);
      const all = [];
      for (let page = 1; ; page += 1) {
        const result = await call('GET', RECORDS, {
          token,
          query: { filter, sort: 'updated,id', perPage: String(PAGE), page: String(page) },
        });
        all.push(...result.items.map(serverRecOf));
        if (!(result.totalPages > page)) return all;
      }
    },

    // SYNC-4: resolves to `{ rec, overruled }`: the server record, or null for a delete of a record
    // the server lacks, and the fields that the server changed too (they keep the server value).
    // `base` is the server copy of the record at the last pull or push, or null. With no base the
    // device never saw a server change (a lost create answer, a first login): the change goes as it
    // is (SYNC-5, SYNC-8). A record that moved on the server since `base` gets the field-level
    // merge; the window between the GET and the PATCH is accepted (one owner, two clients).
    push: async (token, change, owner, base = null) => {
      const found = await findRecord(token, change, owner);
      if (!found) return { rec: change.op === 'delete' ? null : await create(token, change, owner), overruled: [] };
      if (change.op === 'delete' || !base || found.updated === base.updated) return { rec: await patch(token, found.id, bodyOf(change)), overruled: [] };
      const { data, overruled } = mergeFields(found.data ?? {}, base.data ?? null, change.data);
      return { rec: await patch(token, found.id, { deleted: false, data }), overruled };
    },

    // The returned function closes the stream. A failed subscription is silent: the sync driver also
    // syncs at other moments, so the stream only makes a sync sooner. `token` is a text or a function
    // that gives the token at each connect, since the browser reconnects by itself and the token may
    // be a refreshed one. `onReconnect` runs at each connect after the first: the stream missed the
    // changes of the time between.
    subscribe: (token, onChange, { onReconnect = () => {} } = {}) => {
      const tokenOf = typeof token === 'function' ? token : () => token;
      const source = new EventSource(`${base}/api/realtime`);
      let connects = 0;
      source.addEventListener('PB_CONNECT', async (event) => {
        connects += 1;
        if (connects > 1) onReconnect();
        try {
          const { clientId } = JSON.parse(event.data);
          await call('POST', '/api/realtime', { token: tokenOf(), body: { clientId, subscriptions: ['maney_records'] } });
        } catch {
          // See above.
        }
      });
      source.addEventListener('maney_records', (event) => {
        let rec;
        try {
          const { action, record } = JSON.parse(event.data);
          rec = serverRecOf(action === 'delete' ? { ...record, deleted: true } : record);
        } catch {
          return; // A malformed event is dropped.
        }
        onChange(rec);
      });
      return () => source.close();
    },
  };
};
