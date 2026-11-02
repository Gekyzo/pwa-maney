import { addTodo, editTodo, setTodoDone, deleteTodo, findTodo, sortedTodos, isLate, localDay } from '#todos';
import { intlTag } from '#i18n';
import { bindSheetDrag } from '#ds/sheet';
import { $, el, ui, state, t, lang, apply, render } from '#ui/context';
import { iconButton } from '#ui/controls';
import { rowKey, swipeRow } from '#ui/rows';

export const openTodoSheet = (id = null) => {
  const todo = id ? findTodo(state, id) : null;
  ui.sheet = 'todo';
  ui.editing = todo ? id : null;
  $('todo-sheet-title').textContent = t(todo ? 'todos.edit' : 'todos.add');
  $('todo-text').value = todo?.text ?? '';
  $('todo-due').value = todo?.due ?? '';
  render();
  $('todo-text').focus();
};

export const closeTodoSheet = () => {
  ui.sheet = null;
  ui.editing = null;
  render();
};

const remove = (id) => apply(deleteTodo(state, id), { undoText: t('toast.todoDeleted') });

// The day and the month of a due date, in the language of the screen. The date is a calendar day,
// so it is read and written in UTC.
const dueText = (due) =>
  new Intl.DateTimeFormat(intlTag(lang), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${due}T00:00:00Z`));

// A row: the check box, the text and the due date. It slides left to show Delete (TODO-10).
const row = (todo, today) => {
  const labelId = `todo-label-${todo.id}`;
  const check = el('input', {
    className: 'item-row-check',
    type: 'checkbox',
    checked: todo.done,
    // A refused tick renders again, so that the box shows the stored state.
    onchange: (event) => {
      if (!apply(setTodoDone(state, todo.id, event.target.checked, new Date().toISOString()))) render();
    },
  });
  // The box is named by the text of its row, so each one has its own name.
  check.setAttribute('aria-labelledby', labelId);
  const meta = [];
  if (todo.due !== null) {
    const due = el('small', { className: 'item-row-meta todos-due', textContent: dueText(todo.due) });
    if (isLate(todo, today)) due.dataset.late = '';
    meta.push(due);
  }
  const name = el('button', { className: 'item-row-name', type: 'button', onclick: () => openTodoSheet(todo.id) }, [
    el('span', { className: 'item-row-label', id: labelId, textContent: todo.text }),
    ...meta,
  ]);
  const body = el('div', { className: 'item-row-body' }, [check, name]);
  const actions = [iconButton('trash', t('row.delete', { text: todo.text }), () => remove(todo.id), { variant: 'danger' })];
  const node = el('li', { className: todo.done ? 'item-row done' : 'item-row' }, [swipeRow(rowKey('todo', todo.id), body, actions)]);
  node.dataset.id = todo.id;
  return node;
};

export const renderTodos = () => {
  $('todos').hidden = ui.view !== 'todos';
  if (ui.openId?.startsWith('todo:') && !findTodo(state, ui.openId.slice('todo:'.length))) ui.openId = null;
  const today = localDay(new Date());
  $('todo-list').replaceChildren(...sortedTodos(state.todos).map((todo) => row(todo, today)));
  $('todos-empty').hidden = state.todos.length > 0;
  $('todo-sheet').hidden = ui.sheet !== 'todo';
};

export const bind = () => {
  $('todos-add').addEventListener('click', () => openTodoSheet());
  $('todo-veil').addEventListener('click', closeTodoSheet);
  $('todo-close').addEventListener('click', closeTodoSheet);
  bindSheetDrag($('todo-sheet'), { close: closeTodoSheet });
  $('todo-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = { text: $('todo-text').value, due: $('todo-due').value };
    const result = ui.editing ? editTodo(state, ui.editing, fields) : addTodo(state, fields);
    if (apply(result)) closeTodoSheet();
  });
};
