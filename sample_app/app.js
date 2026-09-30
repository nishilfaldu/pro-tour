let searchTerm = '';
let searchPending = false;
const seed = [
  { id: 'task-1', name: 'Draft release notes', details: 'Summarize the latest changes for the team.', status: 'todo' },
  { id: 'task-2', name: 'Review onboarding flow', details: 'Check the first-run experience.', status: 'in-progress' },
  { id: 'task-3', name: 'Approve color palette', details: 'Final visual sign-off.', status: 'done' },
];
const labels = { todo: 'To do', 'in-progress': 'In progress', done: 'Done' };
const storageKey = 'fieldnotes-long-demo-v2';
let tasks;
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  tasks = Array.isArray(saved) ? saved : structuredClone(seed);
} catch {
  tasks = structuredClone(seed);
}
let editingId = null;
const list = document.querySelector('#task-list');
const dialog = document.querySelector('#task-dialog');
const form = document.querySelector('#task-form');
const filter = document.querySelector('#status-filter');
const save = () => localStorage.setItem(storageKey, JSON.stringify(tasks));

function render() {
  const visible = tasks.filter(task => (filter.value === 'all' || task.status === filter.value) && (task.name + ' ' + task.details).toLowerCase().includes(searchTerm.toLowerCase()));
  document.querySelector('#visible-count').textContent = visible.length;
  document.querySelector('#total-count').textContent = tasks.length;
  document.querySelector('#empty-state').hidden = visible.length !== 0;
  list.replaceChildren(...visible.map(task => {
    const row = document.createElement('article');
    row.className = 'task';
    row.dataset.taskId = task.id;
    const content = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = task.name;
    const details = document.createElement('p');
    details.textContent = task.details;
    content.append(title, details);
    const controls = document.createElement('div');
    controls.className = 'task-controls';
    const status = document.createElement('select');
    status.setAttribute('aria-label', `Status for ${task.name}`);
    for (const [value, label] of Object.entries(labels)) {
      const option = new Option(label, value);
      status.add(option);
    }
    status.value = task.status;
    status.addEventListener('change', () => {
      task.status = status.value;
      save();
      render();
    });
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'Edit';
    edit.setAttribute('aria-label', `Edit ${task.name}`);
    edit.addEventListener('click', () => openTask(task));
    controls.append(status, edit);
    row.append(content, controls);
    return row;
  }));
}

function openTask(task) {
  editingId = task?.id ?? null;
  form.reset();
  document.querySelector('#dialog-mode').textContent = task ? 'EDIT TASK' : 'NEW TASK';
  document.querySelector('#dialog-title').textContent = task ? 'Edit task' : 'Add a task';
  if (task) {
    form.elements.name.value = task.name;
    form.elements.details.value = task.details;
    form.elements.status.value = task.status;
  }
  dialog.showModal();
  form.elements.name.focus();
}

document.querySelector('#new-task').addEventListener('click', () => openTask());
document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());
document.querySelector('#cancel-dialog').addEventListener('click', () => dialog.close());
document.querySelector('#reset').addEventListener('click', () => {
  tasks = structuredClone(seed);
  searchTerm = '';
  document.querySelector('#search').value = '';
  document.querySelector('#search-state').textContent = 'Search ready';
  filter.value = 'all';
  save();
  render();
});
filter.addEventListener('change', render);
form.addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(form);
  const name = String(data.get('name')).trim();
  if (!name) return;
  const value = { name, details: String(data.get('details')).trim(), status: String(data.get('status')) };
  if (editingId) Object.assign(tasks.find(task => task.id === editingId), value);
  else tasks.unshift({ id: crypto.randomUUID(), ...value });
  save();
  dialog.close();
  render();
});
render();
document.querySelector('#apply-search').addEventListener('click', () => {
  if (searchPending) return;
  searchPending = true;
  list.setAttribute('aria-busy', 'true');
  document.querySelector('#search-state').textContent = 'Searching, please wait';
  const term = document.querySelector('#search').value.trim();
  setTimeout(() => {
    searchTerm = term;
    searchPending = false;
    list.setAttribute('aria-busy', 'false');
    document.querySelector('#search-state').textContent = 'Search updated';
    render();
  }, 900);
});
document.querySelector('#clear-search').addEventListener('click', () => {
  if (searchPending) return;
  searchTerm = '';
  document.querySelector('#search').value = '';
  document.querySelector('#search-state').textContent = 'Search ready';
  render();
});

