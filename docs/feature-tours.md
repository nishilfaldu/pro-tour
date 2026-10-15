# Feature tours

A feature tour is a short Playwright test, in `.tours/<feature>.tour.ts`, that shows a change working in the
app. `pro-tour run` records it as a video: a cursor moves to each element before it is used, text is typed key
by key, and each step and check appears as a notice. `pro-tour publish` posts the video on the pull request.

Run `pro-tour` through the project's package runner: `pnpm exec pro-tour`, `npx pro-tour`, `yarn pro-tour`.

## When to make one

After a change that users can see or do in the app, once it works, or when you are asked for a feature tour
or a demo video. Skip refactors and backend-only, dependency, test and documentation changes, or when you
are told not to.

## Write it

Name the file for the feature as a user sees it, in kebab-case: `.tours/assignee-filter.tour.ts`, not the
branch name. In a monorepo, use the app package's `.tours/` (`apps/web/.tours/login.tour.ts`). If a tour of
the feature exists, update it instead of adding another; if the change removes the feature, delete its tour.

```ts
import { expect, test } from 'pro-tour';

test('Assign a task to a teammate', async ({ page }) => {
  await test.step('Open a new task', async () => {
    await page.getByRole('button', { name: 'New task' }).click();
    await expect(page.getByLabel('Assignee'), 'Teammates are loading').toBeDisabled();
    await expect(page.getByLabel('Assignee'), 'Teammates are listed').toBeEnabled();
  });

  await test.step('Assign it to Ana and save', async () => {
    await page.getByLabel('Task name').fill('Prepare launch checklist');
    await page.getByLabel('Assignee').selectOption('Ana Lima');
    await page.getByRole('button', { name: 'Save task' }).click();
    await expect(page.getByText('Assigned to Ana Lima'), 'The card says Assigned to Ana Lima').toBeVisible();
  });
});
```

It is Playwright's `test` and `expect`, so everything you know of Playwright works: locators, matchers,
`expect.poll`, `page.evaluate`. `pro-tour run` and `pro-tour check` enforce four things the video needs, and say
what to change when one is missing:

- `test` and `expect` come from `'pro-tour'`, not `'@playwright/test'`.
- A tour is one `test`. Its title is the video's title card.
- Every action is inside a `test.step`. Its title is shown while the step runs.
- Every `expect` has a message as its second argument. It is shown as a check when the expect passes or fails.

The test starts on the page at `--url`, already loaded, in a fresh browser (no cookies or local storage) with a
1280×800 viewport. Move around as a user would, by clicking, or with `page.goto('/path')`, which resolves
against `--url`. Data on the app's server is kept between runs, so do not depend on what an earlier run made:
use names that are new each time, or reset the data first.

Show what the change lets a user see or do, including new states such as empty states and errors, and leave
out what the app already did. A few steps (about 3 to 7) make a video worth watching. Nothing is sped up: if
the app is slow, the video shows it. Never weaken or drop an expect to make a tour pass: a tour that fails
because the change is broken is the right result, so fix the change or tell the user. Do not put secrets or
personal data on screen.

## Record it

Start the app if it is not running, then record the tour with the URL the app runs at:

```sh
pnpm exec pro-tour run .tours/<feature>.tour.ts --url http://localhost:3000
```

It type-checks the tour first (`pro-tour check` does only that, in about a second), records it and prints each
step and check. The video is `.videos/<feature>.mp4`. Tell the user where it is.

The video shows the whole viewport. If the app's dev server draws its own badge or toolbar over the page, hide
it with `--hide <CSS selector>`, once per selector, such as `--hide astro-dev-toolbar`. The Next.js dev badge is
hidden already, unless it shows an error. The step and check notices sit top right and move to the bottom
when the element the cursor goes to is under them.

### If the tour fails

The output has the error at the line of the tour where it happened, then the page's visible DOM where it
stopped. The DOM can be long, so the last line repeats the failure: the step, the error and the tour line.

While you fix the tour, run it with `--fast`: the same checks and output, without pauses or a recording, so a
run takes seconds and the last recording stays as it was. Fast runs do not wait between actions, so a check of
a short-lived state (a spinner, "Saving…") can pass in one kind of run and fail in the other. Once it passes,
run it without `--fast` to record the video.

Fix the tour, or the change if the failure is a real bug, and run it again. After about three failed
attempts, stop and tell the user what is failing.

### Common locator mistakes

- `getByText` also matches text that is hidden visually but kept for screen readers, such as an `aria-live`
  status region, and then matches two elements. Pass `{ exact: true }`, or look inside a region:
  `page.getByRole('main').getByText('Saved')`.
- A link styled as a button often has `role="button"` (shadcn and Base UI do this with `render={<a />}`), so
  `getByRole('link')` does not find it. Try `getByRole('button', { name: '…' })`, and check the DOM in the
  failure output for the role.
- Reading or writing the clipboard needs permission. The test also receives `context`:

  ```ts
  test('Copy the invite link', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    // …
  });
  ```

Exit codes: 0 passed, 1 the tour failed, 2 usage or setup error, 3 the recording failed (the app is not
reachable at `--url`, or the browser or encoder failed; the error says what to do). If the browser is not
installed, run `pro-tour install-browser`. If a sandbox stops the browser from starting, ask the user to let
you run `pro-tour` outside it.

## Publish it

Commit the tour with the change, push, and open or update the pull request. Then:

```sh
pnpm exec pro-tour publish
```

It posts each recording in `.videos/` as a comment on the branch's pull request: the video, its steps and
checks, and the commit it was recorded at. Older comments of the same tour are hidden as outdated, and each
video is deleted once it is posted. Give the user the comment's link. `--pr <number>` picks the pull request,
naming tours publishes only those, and `--dry-run` prints the comment without posting it.

A recording must show the code at the PR's head. Recording before you commit is fine, as long as what you then
commit and push is the code you recorded (changes in `.tours/` do not count). If the code changed after the
recording, such as after a rebase, new commits or commits you have not pushed, `publish` posts nothing and
says why: push, or record the tour again. `--allow-stale` posts it anyway, and the comment then names the
commit it shows.
