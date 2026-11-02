// The to-dos of the doc: pure operations. A to-do is { id, text, due, done, doneAt }.
export const MAX_TODO = 500;

// A real calendar date `YYYY-MM-DD`.
export const isDate = (text) => {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

// A real ISO-8601 time with a zone: a real date, hours 00-23, minutes and seconds 00-59.
export const isIso = (text) => {
  if (typeof text !== 'string') return false;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(text);
  if (!match || !isDate(match[1])) return false;
  const [hour, minute, second, zoneHour = 0, zoneMinute = 0] = match.slice(2).map((part) => Number(part ?? 0));
  return hour < 24 && minute < 60 && second < 60 && zoneHour < 24 && zoneMinute < 60;
};

const missing = (state) => ({ state, error: { key: 'error.todoMissing' } });

// The clean fields, or an error message.
const check = ({ text, due }) => {
  const clean = String(text ?? '').trim();
  if (!clean) return { error: { key: 'error.textRequired' } };
  if (clean.length > MAX_TODO) return { error: { key: 'error.textTooLong', params: { max: MAX_TODO } } };
  const day = due === '' || due == null ? null : due;
  if (day !== null && !isDate(day)) return { error: { key: 'error.dateInvalid' } };
  return { clean: { text: clean, due: day } };
};

export const findTodo = (state, id) => state.todos.find((todo) => todo.id === id) ?? null;

export const addTodo = (state, fields, id = crypto.randomUUID()) => {
  const { clean, error } = check(fields);
  if (error) return { state, error };
  return { state: { ...state, todos: [...state.todos, { id, ...clean, done: false, doneAt: null }] } };
};

const change = (state, id, patch) => ({
  state: { ...state, todos: state.todos.map((todo) => (todo.id === id ? { ...todo, ...patch } : todo)) },
});

export const editTodo = (state, id, fields) => {
  if (!findTodo(state, id)) return missing(state);
  const { clean, error } = check(fields);
  if (error) return { state, error };
  return change(state, id, clean);
};

export const setTodoDone = (state, id, done, nowIso) => {
  if (!findTodo(state, id)) return missing(state);
  if (done && !isIso(nowIso)) return { state, error: { key: 'error.dateInvalid' } };
  return change(state, id, { done: Boolean(done), doneAt: done ? nowIso : null });
};

export const deleteTodo = (state, id) => {
  if (!findTodo(state, id)) return missing(state);
  return { state: { ...state, todos: state.todos.filter((todo) => todo.id !== id) } };
};

// The local calendar day `YYYY-MM-DD` of a time. The caller gives the time: this module reads no clock.
export const localDay = (date) =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part, index) => String(part).padStart(index ? 2 : 4, '0')).join('-');

// An open to-do whose due date is before `today` (`YYYY-MM-DD`).
export const isLate = (todo, today) => !todo.done && todo.due !== null && todo.due < today;

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Open to-dos first: by due date, none last, then by id. Done ones after: the latest first.
export const sortedTodos = (todos) =>
  [...todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done) return byText(b.doneAt ?? '', a.doneAt ?? '') || byText(a.id, b.id);
    if (a.due !== b.due) return a.due === null ? 1 : b.due === null ? -1 : byText(a.due, b.due);
    return byText(a.id, b.id);
  });

// A clean to-do, or null.
export const normalizeTodo = (value) => {
  if (typeof value !== 'object' || value === null) return null;
  const { id, text, due, done, doneAt } = value;
  if (typeof id !== 'string' || id === '' || typeof text !== 'string') return null;
  const clean = text.trim();
  if (clean === '' || clean.length > MAX_TODO) return null;
  if (due !== null && !isDate(due)) return null;
  if (typeof done !== 'boolean') return null;
  if (doneAt !== null && !isIso(doneAt)) return null;
  return { id, text: clean, due, done, doneAt };
};
