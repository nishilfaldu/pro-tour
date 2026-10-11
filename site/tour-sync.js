// The checklist from the demo tour's report. `at` is when the step that shows each behavior passes, in
// seconds into the video; an item is ticked once the video has reached it.
const behaviors = [
  { text: 'The Assignee menu can be searched and shows task counts.', step: 1, at: 9.5 },
  { text: 'Choosing a person with no tasks shows an empty state with a way to clear filters.', step: 2, at: 14.5 },
  { text: 'Clear filters restores Anyone, All statuses, and the full board.', step: 3, at: 19 },
  { text: 'Choosing a person shows only their tasks and updates the task count.', step: 4, at: 25.9 },
  { text: 'Assignee and Status filters work together.', step: 5, at: 32.3 },
  { text: 'Unassigned shows tasks with no assignee.', step: 6, at: 38.7 },
];

const list = document.getElementById('checklist');
const items = behaviors.map(({ text, step }) => {
  const item = document.createElement('li');
  const where = document.createElement('span');
  where.className = 'step';
  where.textContent = `(step ${step})`;
  item.append(`${text} `, where);
  list.append(item);
  return item;
});

const video = document.getElementById('tour');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sync = () => {
  for (const [i, { at }] of behaviors.entries()) items[i].classList.toggle('done', reduced || video.currentTime >= at);
};
for (const event of ['timeupdate', 'seeked', 'loadedmetadata']) video.addEventListener(event, sync);
if (reduced) {
  video.removeAttribute('autoplay');
  video.pause();
}
sync();
