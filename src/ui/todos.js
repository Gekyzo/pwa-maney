import { addTodo, editTodo, setTodoDone, deleteTodo, findTodo, sortedTodos, isLate, localDay } from '#todos';
import { intlTag } from '#i18n';
import { bindSheetDrag } from '#ds/sheet';
import { settle } from '#swipe';
import { SIDE_BUTTON, DRAG_START, $, el, ui, state, t, lang, apply, render, guardClick } from '#ui/context';
import { iconButton } from '#ui/controls';

const openSheet = (id = null) => {
  const todo = id ? findTodo(state, id) : null;
  ui.sheetOpen = true;
  ui.editing = todo ? id : null;
  $('todo-sheet-title').textContent = t(todo ? 'todos.edit' : 'todos.add');
  $('todo-text').value = todo?.text ?? '';
  $('todo-due').value = todo?.due ?? '';
  render();
  $('todo-text').focus();
};

export const closeTodoSheet = () => {
  ui.sheetOpen = false;
  ui.editing = null;
  render();
};

const remove = (id) => apply(deleteTodo(state, id), { undoText: t('toast.todoDeleted') });

// The day and the month of a due date, in the language of the screen. The date is a calendar day,
// so it is read and written in UTC.
const dueText = (due) =>
  new Intl.DateTimeFormat(intlTag(lang), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${due}T00:00:00Z`));

export const moveRow = (row, x) => {
  row.style.transform = x ? `translateX(${x}px)` : '';
};

// Lets a horizontal drag of the row show the side actions behind it (`settle` decides).
const bindSwipe = (row, width, id) => {
  let drag = null;
  row.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, base: ui.openId === id ? -width : 0, active: false };
  });
  row.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.active) {
      if (Math.abs(dy) > DRAG_START && Math.abs(dy) >= Math.abs(dx)) drag = null;
      if (!drag || Math.abs(dx) < DRAG_START) return;
      drag.active = true;
      row.setPointerCapture(event.pointerId);
      row.classList.add('dragging');
    }
    drag.at = Math.max(-width, Math.min(0, drag.base + dx));
    moveRow(row, drag.at);
  });
  const finish = (event) => {
    if (!drag) return;
    const { active, x, at } = drag;
    drag = null;
    if (!active) return;
    // The click that follows a drag must not open the sheet or tick the to-do.
    guardClick();
    const side = settle(event.clientX - x, { start: 0, end: width }, ui.openId === id ? 'end' : null);
    ui.openId = side ? id : null;
    ui.settleFrom = { id, x: at };
    render();
  };
  row.addEventListener('pointerup', finish);
  row.addEventListener('pointercancel', finish);
};

// A row: the check box, the text and the due date. It slides left to show Delete (TODO-10).
const row = (todo, today) => {
  const open = ui.openId === todo.id;
  const actions = [iconButton('trash', t('row.delete', { text: todo.text }), () => remove(todo.id), { variant: 'danger' })];
  const width = actions.length * SIDE_BUTTON;
  const labelId = `todo-label-${todo.id}`;
  const check = el('input', {
    className: 'item-row-check',
    type: 'checkbox',
    checked: todo.done,
    onchange: (event) => apply(setTodoDone(state, todo.id, event.target.checked, new Date().toISOString())),
  });
  check.setAttribute('aria-label', t('todos.done'));
  check.setAttribute('aria-describedby', labelId);
  const meta = [];
  if (todo.due !== null) {
    const due = el('small', { className: 'item-row-meta todos-due', textContent: dueText(todo.due) });
    if (isLate(todo, today)) due.dataset.late = '';
    meta.push(due);
  }
  const name = el('button', { className: 'item-row-name', type: 'button', onclick: () => openSheet(todo.id) }, [
    el('span', { className: 'item-row-label', id: labelId, textContent: todo.text }),
    ...meta,
  ]);
  const body = el('div', { className: 'item-row-body' }, [check, name]);
  const from = ui.settleFrom?.id === todo.id ? ui.settleFrom.x : null;
  if (from !== null) {
    // Start where the drag ended, then move to the settled place with the CSS transition.
    moveRow(body, from);
    requestAnimationFrame(() => requestAnimationFrame(() => moveRow(body, open ? -width : 0)));
  } else moveRow(body, open ? -width : 0);
  bindSwipe(body, width, todo.id);
  const box = el('div', { className: open ? 'item-row-swipe open' : 'item-row-swipe' }, [
    el('div', { className: 'item-row-actions', inert: !open }, actions),
    body,
  ]);
  const node = el('li', { className: todo.done ? 'item-row done' : 'item-row' }, [box]);
  node.dataset.id = todo.id;
  return node;
};

export const renderTodos = () => {
  const visible = ui.view === 'todos';
  $('todos').hidden = !visible;
  $('fab').hidden = !visible || ui.sheetOpen;
  if (ui.openId && !findTodo(state, ui.openId)) ui.openId = null;
  const today = localDay(new Date());
  $('todo-list').replaceChildren(...sortedTodos(state.todos).map((todo) => row(todo, today)));
  ui.settleFrom = null;
  $('todos-empty').hidden = state.todos.length > 0;
  $('todo-sheet').hidden = !ui.sheetOpen;
};

export const bind = () => {
  $('fab').addEventListener('click', () => openSheet());
  $('todos-add').addEventListener('click', () => openSheet());
  $('todo-veil').addEventListener('click', closeTodoSheet);
  $('todo-close').addEventListener('click', closeTodoSheet);
  bindSheetDrag($('todo-sheet'), { close: closeTodoSheet });
  $('todo-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = { text: $('todo-text').value, due: $('todo-due').value };
    const result = ui.editing ? editTodo(state, ui.editing, fields) : addTodo(state, fields);
    if (apply(result)) closeTodoSheet();
  });
  // A tap out of the open row closes it, without a render, so that the tap still does its work.
  document.addEventListener(
    'pointerdown',
    (event) => {
      const box = document.querySelector('.item-row-swipe.open');
      if (!box || box.contains(event.target)) return;
      ui.openId = null;
      box.classList.remove('open');
      moveRow(box.querySelector('.item-row-body'), 0);
      box.querySelector('.item-row-actions').inert = true;
    },
    true,
  );
};
