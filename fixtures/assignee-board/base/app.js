import { t } from './strings.js';
import { h, Menu, toast, uid } from './ui.js';

const people = [
  { id: 'u-priya', name: 'Priya Shah' },
  { id: 'u-marco', name: 'Marco Diaz' },
  { id: 'u-ana', name: 'Ana Lima' },
];
const me = 'u-marco';
const statuses = { todo: 'To do', 'in-progress': 'In progress', done: 'Done' };
const seed = [
  { id: 'task-1', name: 'Draft release notes', status: 'todo', assignee: 'u-priya' },
  { id: 'task-2', name: 'Review onboarding flow', status: 'in-progress', assignee: 'u-marco' },
  { id: 'task-3', name: 'Approve color palette', status: 'done', assignee: 'u-priya' },
  { id: 'task-4', name: 'Fix flaky upload test', status: 'todo', assignee: null },
];
const storageKey = 'fieldnotes-board-v2';

let tasks;
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  tasks = Array.isArray(saved) ? saved : structuredClone(seed);
} catch {
  tasks = structuredClone(seed);
}
const filters = { status: 'all' };
const save = () => localStorage.setItem(storageKey, JSON.stringify(tasks));
const person = id => people.find(p => p.id === id);
const initials = name => name.split(' ').map(word => word[0]).join('');
const avatar = id => h('span', { class: `avatar${id ? '' : ' none'}` }, id ? initials(person(id).name) : '–');

function statusSelect(value, props) {
  return h('select', props, Object.entries(statuses).map(([key, label]) => h('option', { value: key, selected: key === value }, label)));
}

function update(id, changes) {
  Object.assign(tasks.find(task => task.id === id), changes);
  save();
  render();
}

// Toolbar
const statusId = uid();
const statusFilter = h('select', { id: statusId, class: 'filter', onchange: event => {
  filters.status = event.target.value;
  render();
} }, h('option', { value: 'all' }, t('filter.status.all')), Object.entries(statuses).map(([key, label]) => h('option', { value: key }, label)));

const summary = h('p', { class: 'summary', 'aria-live': 'polite' });
const list = h('ul', { class: 'board' });
const empty = h('p', { class: 'empty', hidden: true }, t('empty.status'));

// Dialog
const dialog = h('dialog', { class: 'task-dialog' });
const form = h('form', { method: 'dialog' });
const nameId = uid();
const assigneeId = uid();
const dialogStatusId = uid();
const dialogTitle = h('h2', {});
let editingId = null;
form.append(
  dialogTitle,
  h('label', { for: nameId }, t('field.name')),
  h('input', { id: nameId, name: 'name', required: true, maxlength: '100', autocomplete: 'off' }),
  h('label', { for: assigneeId }, t('field.assignee')),
  h('select', { id: assigneeId, name: 'assignee' }, h('option', { value: '' }, t('assignee.none')), people.map(p => h('option', { value: p.id }, p.name))),
  h('label', { for: dialogStatusId }, t('field.status')),
  statusSelect('todo', { id: dialogStatusId, name: 'status' }),
  h('div', { class: 'dialog-actions' },
    h('button', { type: 'button', onclick: () => dialog.close() }, t('dialog.cancel')),
    h('button', { type: 'submit', class: 'primary' }, t('dialog.save'))),
);
dialog.append(form);
form.addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(form);
  const name = String(data.get('name')).trim();
  if (!name) return;
  const value = { name, assignee: String(data.get('assignee')) || null, status: String(data.get('status')) };
  if (editingId) Object.assign(tasks.find(task => task.id === editingId), value);
  else tasks.unshift({ id: `task-${Date.now()}`, ...value });
  save();
  dialog.close();
  render();
});

function openTask(task) {
  editingId = task?.id ?? null;
  form.reset();
  dialogTitle.textContent = task ? t('dialog.edit') : t('dialog.new');
  if (task) {
    form.elements.name.value = task.name;
    form.elements.assignee.value = task.assignee ?? '';
    form.elements.status.value = task.status;
  }
  dialog.showModal();
  form.elements.name.focus();
}

function card(task) {
  const titleId = uid();
  const owner = person(task.assignee);
  const more = h('button', {
    type: 'button',
    class: 'icon',
    'aria-label': t('task.more', task.name),
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
    onclick: () => Menu(more, [
      { label: t('menu.edit'), action: () => openTask(task) },
      { label: t('menu.assignToMe'), action: () => {
        update(task.id, { assignee: me });
        toast(t('toast.assigned', person(me).name));
      } },
    ]),
  }, '⋯');
  return h('li', { class: 'card', 'aria-labelledby': titleId },
    h('div', { class: 'card-main' },
      h('h3', { id: titleId }, task.name),
      h('div', { class: 'meta' },
        h('span', { class: `pill ${task.status}` }, statuses[task.status]),
        h('span', { class: 'owner' }, avatar(task.assignee), owner?.name ?? t('assignee.none')))),
    statusSelect(task.status, { class: 'card-status', 'aria-label': t('field.status'), onchange: event => update(task.id, { status: event.target.value }) }),
    more);
}

function render() {
  const visible = tasks.filter(task => filters.status === 'all' || task.status === filters.status);
  summary.textContent = t('summary', visible.length, tasks.length);
  list.replaceChildren(...visible.map(card));
  empty.hidden = visible.length > 0;
}

document.querySelector('#root').append(h('main', { class: 'shell' },
  h('header', { class: 'heading' },
    h('div', {}, h('p', { class: 'eyebrow' }, t('board.eyebrow')), h('h1', {}, t('board.heading'))),
    h('button', { type: 'button', class: 'primary round', 'aria-label': t('task.create'), onclick: () => openTask() }, '+')),
  h('div', { class: 'toolbar' },
    h('div', { class: 'field' }, h('label', { for: statusId }, t('filter.status')), statusFilter),
    h('span', { class: 'spacer' }),
    summary,
    h('button', { type: 'button', onclick: () => toast(t('view.saved')) }, t('view.save'))),
  list,
  empty,
), dialog);
render();
