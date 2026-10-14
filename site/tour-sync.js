// The demo tour's steps, from its recording: `at` is when each step starts, in seconds into the video. A step
// is ticked once the video has reached the next one (or the end card).
const steps = [
  { title: 'Open a new task: teammates load from the directory', at: 3.9 },
  { title: 'Assign the new task to Ana and save it', at: 9.1 },
  { title: 'Edit it: Ana is still selected', at: 17.9 },
  { title: 'Reassign it to Ben', at: 22.5 },
];
const END = 28.6;

const list = document.getElementById('checklist');
const items = steps.map(({ title, at }) => {
  const item = document.createElement('li');
  const where = document.createElement('span');
  where.className = 'step';
  where.textContent = `0:${String(Math.floor(at)).padStart(2, '0')}`;
  item.append(`${title} `, where);
  list.append(item);
  return item;
});

const video = document.getElementById('tour');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sync = () => {
  for (const [i] of steps.entries()) items[i].classList.toggle('done', reduced || video.currentTime >= (steps[i + 1]?.at ?? END));
};
for (const event of ['timeupdate', 'seeked', 'loadedmetadata']) video.addEventListener(event, sync);
if (reduced) {
  video.removeAttribute('autoplay');
  video.pause();
}
sync();
