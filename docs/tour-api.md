# Tour API

A tour is a TypeScript module in `.tours/<feature>.tour.ts` that records a short, captioned video of one
feature for PR reviewers. The runner opens the app at its root URL in a fresh browser (no cookies or
local storage) with a 1280×800 viewport. Data on the app's server persists between runs, so a tour must
not depend on what an earlier run created.

```ts
import type { Tour, TourMeta } from 'pro-tour';

export const meta = {
  title: 'Short feature title',
  summary: 'One sentence a reviewer reads on the title card.',
  behaviors: {
    'some-behavior': 'What the PR makes possible, as a reviewer reads it in a checklist.',
  },
} satisfies TourMeta;

export async function run(t: Tour): Promise<void> {
  const { page } = t; // Playwright Page

  await t.step('Caption shown at the bottom of the video', async () => {
    await t.click(locator);
  }, [
    t.visible('Check label shown as a chip', otherLocator),
  ], { covers: ['some-behavior'] });
}
```

The tour starts on the app's root URL. To reach another page, click through the app's navigation
as a user would, or call `await t.goto('/some/path')` (paths resolve against the app URL).

`pro-tour check` type-checks tours in about a second, and `pro-tour run` does so before recording, so
a misused API is reported before any video is made. The `pro-tour` types resolve even if the app
repository does not install pro-tour or use TypeScript. Plain `.tour.js` tours also run, unchecked.

`t.page` is a Playwright `Page`. Use any Playwright locator (`getByRole`, `getByLabel`,
`getByText`, `getByPlaceholder`, `locator(css)`, `.filter()`, `.nth()`, chaining). Playwright
locators are strict: an action on a locator that matches more than one element fails.

## Steps

`t.step(title, actions, checks)` is one captioned step: an async function with the visible user
actions, then the array of checks that prove what those actions did. Keep tours to 3–7 steps.

The runner evaluates every check before the actions, after each action, and at the end:

- Every check must pass at the end of the step.
- At least one check must be false at some point in the step and pass at the end. A step whose
  checks were already true proves nothing and fails.
- A `t.hidden` check must be visible at some point in the step, so it shows something going away
  (opening a menu and then searching it away in the same step counts).

Checks that were already true are allowed alongside a changed one (for example, "the matching
task is still shown"); the video marks them as unchanged.

## Behaviors

`meta.behaviors` lists what the PR does, by id. A step that demonstrates a behavior passes
`{ covers: ['id', ...] }` as its fourth argument. The tour fails unless every behavior is covered by
a passing step, and a step may not cover an id that is missing from `meta.behaviors`. The PR
comment shows each behavior with the step that proves it.

## Actions (each moves a visible cursor to the element, then acts; waits up to 10 seconds for it)

- `t.click(locator)`
- `t.fill(locator, text)`: types the text visibly into an input.
- `t.select(locator, label)`: picks the option with this visible label in a native `<select>`.
- `t.press(key)`: presses a key such as `'Enter'` or `'Escape'` in the focused element.
- `t.goto(path)`: navigates to a path of the app.

Use these rather than calling `page` directly inside a step, so the runner sees each action.

## Checks (each shows a chip; polled for up to 5 seconds after the actions)

- `t.visible(label, locator)`
- `t.hidden(label, locator)`
- `t.text(label, locator, text)`: trimmed `textContent` equals `text`.
- `t.value(label, locator, value)`: an input's value, or the visible label of a `<select>`'s chosen option.
- `t.check(label, async () => boolean)`: custom predicate.

## What makes a good tour

- Demonstrate the change in the PR, not the rest of the app.
- Show each new behavior happening, including new states such as empty states.
- Each step's checks are the evidence for that step: assert what its actions changed.

## Locators that hold up

- Prefer roles and labels (`getByRole`, `getByLabel`, `getByPlaceholder`). Generated ids and CSS classes
  change between builds.
- Accessible names often carry more than the visible label (an icon's text, a count): match a
  substring or a regular expression, or scope with `.filter({ hasText })`.
- When a label repeats on the page, scope to the region: `page.getByRole('dialog').getByLabel('Status')`,
  `page.getByRole('listitem').filter({ hasText: 'Draft' }).getByRole('button')`.
- Menus, popovers and dialogs from component libraries often mount at the end of `<body>` and may not
  have the role you expect. When a locator fails, the failure file shows the visible DOM around the
  last element the tour acted on and the last elements in `<body>`; build the locator from that.
- A state that disappears on its own (a toast, a "Copied!" tooltip) can be checked in the step whose
  action triggers it; checks are evaluated together right after the step's last action.
- If a tour creates data, give it a unique name (for example with `Date.now()`) so reruns do not collide.
