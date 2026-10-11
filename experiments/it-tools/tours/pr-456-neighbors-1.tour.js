export const meta = {
  title: 'Percentage calculator',
  summary: 'Find the new Math tool, try its three calculations, and copy a result.',
  behaviors: {
    'find-percentage-calculator': 'The Percentage calculator appears in the Math tools and opens at /percentage-calculator.',
    'calculate-percent-of-value': 'Entering a percentage and a value shows the calculated amount.',
    'calculate-value-as-percent': 'Entering two values shows what percentage the first is of the second.',
    'calculate-percentage-change': 'Entering a starting and ending value shows the percentage increase or decrease.',
    'show-empty-incomplete-result': 'A calculation’s result stays empty until both of its inputs are filled.',
    'copy-calculated-result': 'The copy button copies a calculated result to the clipboard.'
  }
};

export async function run(t) {
  const { page } = t;
  let foundInMath = false;

  const input = id => page.locator(`[data-test-id="${id}"] input`);
  const percentageX = input('percentageX');
  const percentageY = input('percentageY');
  const percentageResult = input('percentageResult');
  const numberX = input('numberX');
  const numberY = input('numberY');
  const numberResult = input('numberResult');
  const numberFrom = input('numberFrom');
  const numberTo = input('numberTo');
  const changeResult = input('percentageIncreaseDecrease');

  await t.step('Find Percentage calculator in Math tools and open it', async () => {
    const mathCategory = page.locator('aside .category-name').filter({ hasText: /^Math$/ }).locator('..');
    const entry = mathCategory.locator('a[href="/percentage-calculator"]');
    foundInMath = await entry.count() === 1;
    await t.click(entry);
  }, [
    t.check('Listed under Math', async () => foundInMath),
    t.check('Calculator opens at its route', async () => new URL(page.url()).pathname === '/percentage-calculator')
  ], { covers: ['find-percentage-calculator'] });

  await t.step('A result waits for both inputs', async () => {
    await t.fill(percentageX, '20');
  }, [
    t.value('Percentage entered', percentageX, '20'),
    t.value('Result is still empty', percentageResult, '')
  ], { covers: ['show-empty-incomplete-result'] });

  await t.step('Calculate 20% of 250', async () => {
    await t.fill(percentageY, '250');
  }, [
    t.value('Calculated amount is 50', percentageResult, '50')
  ], { covers: ['calculate-percent-of-value'] });

  await t.step('Find what percentage 25 is of 200', async () => {
    await t.fill(numberX, '25');
    await t.fill(numberY, '200');
  }, [
    t.value('25 is 12.5% of 200', numberResult, '12.5')
  ], { covers: ['calculate-value-as-percent'] });

  await t.step('Calculate the increase from 100 to 125', async () => {
    await t.fill(numberFrom, '100');
    await t.fill(numberTo, '125');
  }, [
    t.value('Increase is 25%', changeResult, '25')
  ], { covers: ['calculate-percentage-change'] });

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await t.step('Copy the calculated increase', async () => {
    await t.click(page.locator('[data-test-id="percentageIncreaseDecrease"] button'));
  }, [
    t.check('Clipboard contains the result', async () =>
      await page.evaluate(async () => (await navigator.clipboard.readText()) === '25'))
  ], { covers: ['copy-calculated-result'] });
}
