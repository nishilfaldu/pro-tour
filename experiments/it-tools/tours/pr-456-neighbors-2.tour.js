export const meta = {
  title: 'Percentage calculator',
  summary: 'Find the new Math tool and see its three calculations and blank-result states.',
  behaviors: {
    'open-percentage-calculator': 'The Percentage calculator appears in the Math tools and opens its own page.',
    'calculate-percent-of-value': 'Entering a percentage and a value shows the calculated amount.',
    'calculate-value-as-percent': 'Entering two values shows what percentage the first is of the second.',
    'calculate-percentage-change': 'Entering From and To values shows the percentage increase or decrease.',
    'blank-results-for-incomplete-input': 'A calculation’s result stays blank until both inputs are entered.',
    'blank-results-for-zero-denominator': 'The percentage ratio and percentage change results stay blank when their denominator is zero.'
  }
};

export async function run(t) {
  const { page } = t;
  const input = id => page.locator(`[data-test-id="${id}"] input`);
  const toolLink = page.getByRole('link', { name: /Percentage calculator/i }).first();
  let listedInMath = false;

  await t.step('Open Percentage calculator from the Math tools', async () => {
    listedInMath = await page.getByText('Math', { exact: true }).first().isVisible() && await toolLink.isVisible();
    await t.click(toolLink);
  }, [
    t.check('Shown in the Math tools', async () => listedInMath),
    t.check('Own calculator page', async () => new URL(page.url()).pathname.endsWith('/percentage-calculator')),
    t.visible('Percentage change calculator', page.getByText('What is the percentage increase/decrease'))
  ], { covers: ['open-percentage-calculator'] });

  await t.step('One input leaves the result blank', async () => {
    await t.fill(input('percentageX'), '25');
  }, [
    t.value('Percentage entered', input('percentageX'), '25'),
    t.value('Result remains blank', input('percentageResult'), '')
  ], { covers: ['blank-results-for-incomplete-input'] });

  await t.step('Calculate 25% of 200', async () => {
    await t.fill(input('percentageY'), '200');
  }, [
    t.value('Calculated amount is 50', input('percentageResult'), '50')
  ], { covers: ['calculate-percent-of-value'] });

  await t.step('Find what percent 50 is of 200', async () => {
    await t.fill(input('numberX'), '50');
    await t.fill(input('numberY'), '200');
  }, [
    t.value('50 is 25% of 200', input('numberResult'), '25')
  ], { covers: ['calculate-value-as-percent'] });

  await t.step('Calculate an increase from 100 to 125', async () => {
    await t.fill(input('numberFrom'), '100');
    await t.fill(input('numberTo'), '125');
  }, [
    t.value('Increase is 25%', input('percentageIncreaseDecrease'), '25')
  ], { covers: ['calculate-percentage-change'] });

  await t.step('Changing To shows a decrease', async () => {
    await t.fill(input('numberTo'), '80');
  }, [
    t.value('Decrease is 20%', input('percentageIncreaseDecrease'), '-20')
  ], { covers: ['calculate-percentage-change'] });

  await t.step('Zero denominators leave both results blank', async () => {
    await t.fill(input('numberY'), '0');
    await t.fill(input('numberFrom'), '0');
  }, [
    t.value('Ratio result is blank', input('numberResult'), ''),
    t.value('Change result is blank', input('percentageIncreaseDecrease'), '')
  ], { covers: ['blank-results-for-zero-denominator'] });
}
