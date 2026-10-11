// The checklist from the demo tour's report. `at` is when the step that proves each behavior passes,
// in seconds into the video, so each item ticks as the video reaches its proof.
const behaviors = [
  { text: 'The Assignee menu can be searched and shows task counts.', step: 1, at: 9.5 },
  { text: 'Choosing a person with no tasks shows an empty state with a way to clear filters.', step: 2, at: 14.5 },
  { text: 'Clear filters restores Anyone, All statuses, and the full board.', step: 3, at: 19 },
  { text: 'Choosing a person shows only their tasks and updates the task count.', step: 4, at: 25.9 },
  { text: 'Assignee and Status filters work together.', step: 5, at: 32.3 },
  { text: 'Unassigned shows tasks with no assignee.', step: 6, at: 38.7 },
];

const tick =
  '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.4 4.8 9 10 3" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const list = document.getElementById('checklist');
const items = behaviors.map(({ text, step }) => {
  const item = document.createElement('li');
  const box = document.createElement('span');
  box.className = 'box';
  box.innerHTML = tick;
  const label = document.createElement('span');
  label.append(`${text} `);
  const where = document.createElement('span');
  where.className = 'step';
  where.textContent = `step ${step}`;
  label.append(where);
  item.append(box, label);
  list.append(item);
  return item;
});

const video = document.getElementById('tour');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sync = () => {
  for (const [i, { at }] of behaviors.entries()) items[i].classList.toggle('done', reduced || video.currentTime >= at);
};
video.addEventListener('timeupdate', sync);
video.addEventListener('seeked', sync);
video.addEventListener('loadedmetadata', sync);
if (reduced) {
  video.removeAttribute('autoplay');
  video.pause();
}
sync();

for (const button of document.querySelectorAll('.copy')) {
  button.addEventListener('click', async () => {
    const text = button.parentElement.querySelector('.c').textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Select it';
    }
    setTimeout(() => {
      button.textContent = 'Copy';
    }, 1600);
  });
}
