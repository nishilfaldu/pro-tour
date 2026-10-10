const strings = {
  'board.eyebrow': 'PROJECT / AUTUMN RELEASE',
  'board.heading': 'Task board',
  'task.create': 'Create task',
  'task.more': name => `More actions for ${name}`,
  'menu.edit': 'Edit',
  'menu.assignToMe': 'Assign to me',
  'filter.status': 'Status',
  'filter.status.all': 'All statuses',
  'assignee.none': 'Unassigned',
  'view.save': 'Save view',
  'view.saved': 'View saved',
  'summary': (visible, total) => `${visible} of ${total} tasks`,
  'empty.status': 'No tasks match this status.',
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
