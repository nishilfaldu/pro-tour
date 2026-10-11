export const meta = {
  title: 'Rename history entries',
  summary: 'Give saved diagrams and timeline snapshots names that are easy to recognize.',
  behaviors: {
    'saved-rename': 'Saved history entries have a Rename control and an inline editor.',
    'enter-save': 'Pressing Enter saves the new name.',
    'escape-cancel': 'Pressing Escape keeps the previous name.',
    'blur-save': 'Leaving the editor saves the name with surrounding spaces removed.',
    persistence: 'A renamed entry keeps its name after reloading the editor.',
    'timeline-rename': 'Timeline snapshots can also be renamed.'
  }
};

export async function run(t) {
  const { page } = t;
  const state = {
    code: 'flowchart TD\n  A[Tour diagram]',
    mermaid: '{"theme":"default"}',
    autoSync: true,
    updateDiagram: false
  };
  const entry = (id, name, type) => ({ id, name, type, time: Date.now(), state });

  await page.evaluate(
    ({ saved, timeline }) => {
      localStorage.setItem('manualHistoryStore', JSON.stringify([saved]));
      localStorage.setItem('autoHistoryStore', JSON.stringify([timeline]));
      localStorage.setItem('autoHistoryMode', JSON.stringify('manual'));
    },
    {
      saved: entry('tour-saved', 'Saved diagram', 'manual'),
      timeline: entry('tour-timeline', 'Timeline snapshot', 'auto')
    }
  );

  await t.step(
    'Open saved history and find the rename control',
    async () => {
      await t.goto('/edit');
      await t.click(page.getByRole('button', { name: 'History' }));
    },
    [
      t.visible('Saved diagram', page.getByText('Saved diagram', { exact: true })),
      t.visible('Rename control', page.getByRole('button', { name: 'Rename' }))
    ],
    { covers: ['saved-rename'] }
  );

  await t.step(
    'Edit the name inline',
    async () => {
      await t.click(page.getByRole('button', { name: 'Rename' }));
    },
    [t.visible('Inline name editor', page.getByRole('textbox', { name: 'Rename entry' }))]
  );

  await t.step(
    'Save a new name with Enter',
    async () => {
      await t.fill(page.getByRole('textbox', { name: 'Rename entry' }), 'Release notes');
      await t.press('Enter');
    },
    [
      t.visible('New name', page.getByText('Release notes', { exact: true })),
      t.hidden('Editor closed', page.getByRole('textbox', { name: 'Rename entry' }))
    ],
    { covers: ['enter-save'] }
  );

  await t.step(
    'Cancel a change with Escape',
    async () => {
      await t.click(page.getByRole('button', { name: 'Rename' }));
      await t.fill(page.getByRole('textbox', { name: 'Rename entry' }), 'Discarded name');
      await t.press('Escape');
    },
    [
      t.visible('Previous name remains', page.getByText('Release notes', { exact: true })),
      t.hidden('Editor closed', page.getByRole('textbox', { name: 'Rename entry' }))
    ],
    { covers: ['escape-cancel'] }
  );

  await t.step(
    'Save a trimmed name by leaving the editor',
    async () => {
      await t.click(page.getByRole('button', { name: 'Rename' }));
      await t.fill(page.getByRole('textbox', { name: 'Rename entry' }), '  Team roadmap  ');
      await t.click(page.getByRole('tab', { name: 'Saved' }));
    },
    [
      t.text(
        'Spaces removed',
        page.locator('#historyList li').first().locator('span[title]'),
        'Team roadmap'
      )
    ],
    { covers: ['blur-save'] }
  );

  await t.step(
    'Reload and confirm the name persists',
    async () => {
      await t.goto('/edit');
      await t.click(page.getByRole('button', { name: 'History' }));
    },
    [t.visible('Saved name persists', page.getByText('Team roadmap', { exact: true }))],
    { covers: ['persistence'] }
  );

  await t.step(
    'Rename a Timeline snapshot',
    async () => {
      await t.click(page.getByRole('tab', { name: 'Timeline' }));
      await t.click(page.getByRole('button', { name: 'Rename' }));
      await t.fill(page.getByRole('textbox', { name: 'Rename entry' }), 'Planning snapshot');
      await t.press('Enter');
    },
    [t.visible('Timeline name updated', page.getByText('Planning snapshot', { exact: true }))],
    { covers: ['timeline-rename'] }
  );
}
