// The client of the PocketBase server (ACC-3, ACC-4, ACC-6). `fetch` is injected, so a test runs
// with no network. No SDK: the app calls the REST API of PocketBase directly.
import { APP_SLUG } from '#config';

const USERS = '/api/collections/users';
const ACCESS = '/api/collections/app_access/records';
const APPS = '/api/collections/apps/records';

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

export const createClient = ({ url, fetch }) => {
  const base = url.replace(/\/+$/, '');

  const call = async (method, path, { token, body, query } = {}) => {
    let response;
    try {
      response = await fetch(`${base}${path}${query ? `?${new URLSearchParams(query)}` : ''}`, {
        method,
        cache: 'no-store',
        headers: {
          ...(token ? { Authorization: token } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
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

  return {
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
  };
};
