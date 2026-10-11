const strings = {
  'board.eyebrow': 'PROJECT / AUTUMN RELEASE',
  'board.heading': 'Task board',
  'task.create': 'Create task',
  'task.more': name => `More actions for ${name}`,
  'menu.edit': 'Edit',
  'menu.assignToMe': 'Assign to me',
  'filter.status': 'Status',
  'filter.status.all': 'All statuses',
  'filter.assignee': 'Assignee',
  'filter.assignee.any': 'Anyone',
  'filter.assignee.none': 'Unassigned',
  'filter.assignee.search': 'Find a person',
  'filter.assignee.count': n => (n === 1 ? '1 task' : `${n} tasks`),
  'filter.clear': 'Clear filters',
  'view.save': 'Save view',
  'view.saved': 'View saved',
  'summary': (visible, total) => `${visible} of ${total} tasks`,
  'empty.status': 'No tasks match this status.',
  'empty.assignee': name => `Nothing assigned to ${name} yet.`,
  'dialog.new': 'New task',
  'dialog.edit': 'Edit task',
  'field.name': 'Task name',
  'field.assignee': 'Assignee',
  'field.status': 'Status',
  'dialog.cancel': 'Cancel',
  'dialog.save': 'Save',
  'toast.assigned': name => `Assigned to ${name}`,
};

export function t(key, ...args) {
  const value = strings[key];
  return typeof value === 'function' ? value(...args) : value;
}
