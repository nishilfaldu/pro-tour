export const meta = {
  title: 'Percentage calculator',
  summary: 'Explore the new Math tool for finding portions, proportions, and percentage changes.',
  behaviors: {
    'open-percentage-calculator': 'The new Percentage calculator appears in the Math tools and opens at /percentage-calculator.',
    'calculate-percent-of-value': 'Entering a percentage and a value shows the calculated portion, such as 123% of 456 = 560.88.',
    'calculate-value-as-percent': 'Entering two values shows what percent the first is of the second.',
    'calculate-percentage-increase': 'Entering a lower From value and a higher To value shows the percentage increase.',
    'calculate-percentage-decrease': 'Entering a higher From value and a lower To value shows a negative percentage change.',
    'show-empty-incomplete-result': 'A calculator’s result stays blank until both of its inputs are filled.'
  }
};

export async function run(t) {
  const { page } = t;
  const input = id => page.locator(`[data-test-id="${id}"] input`);

  await t.step('Open Percentage calculator from the Math tools', async () => {
    await t.click(page.locator('a[href="/percentage-calculator"]').first());
  }, [
    t.check('Calculator opens at its new route', async () => new URL(page.url()).pathname === '/percentage-calculator'),
    t.visible('Percentage input is ready', input('percentageX'))
  ], { covers: ['open-percentage-calculator'] });

  await t.step('An incomplete calculation leaves its result blank', async () => {
    await t.fill(input('percentageX'), '123');
  }, [
    t.value('Percentage entered', input('percentageX'), '123'),
    t.value('Result stays blank', input('percentageResult'), '')
  ], { covers: ['show-empty-incomplete-result'] });

  await t.step('Calculate 123% of 456', async () => {
    await t.fill(input('percentageY'), '456');
  }, [
    t.value('Calculated portion', input('percentageResult'), '560.88')
  ], { covers: ['calculate-percent-of-value'] });

  await t.step('Find what percent 123 is of 456', async () => {
    await t.fill(input('numberX'), '123');
    await t.fill(input('numberY'), '456');
  }, [
    t.value('Percentage of the second value', input('numberResult'), '26.973684210526315')
  ], { covers: ['calculate-value-as-percent'] });

  await t.step('Show the increase from 100 to 200', async () => {
    await t.fill(input('numberFrom'), '100');
    await t.fill(input('numberTo'), '200');
  }, [
    t.value('Percentage increase', input('percentageIncreaseDecrease'), '100')
  ], { covers: ['calculate-percentage-increase'] });

  await t.step('Change the destination to 50 to show a decrease', async () => {
    await t.fill(input('numberTo'), '50');
  }, [
    t.value('Negative percentage change', input('percentageIncreaseDecrease'), '-50')
  ], { covers: ['calculate-percentage-decrease'] });
}
