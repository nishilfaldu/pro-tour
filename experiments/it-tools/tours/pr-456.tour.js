export const meta = {
  title: 'Percentage calculator',
  summary: 'Find percentages, compare values, and calculate percentage changes from the Math tools list.',
  behaviors: {
    'math-tool-listing': 'The Percentage calculator appears in the Math tools list.',
    'percentage-of-value': 'Entering 123% of 456 displays 560.88.',
    'value-as-percentage': 'Entering 123 as a share of 456 displays 26.973684210526315%.',
    'percentage-change': 'Entering a change from 123 to 456 displays a 270.7317073170732% increase.',
    'incomplete-input': 'A calculation’s result stays empty until both inputs are filled.',
    'zero-denominator': 'Entering zero as the base value leaves a percentage result empty instead of displaying an invalid number.'
  }
};

export async function run(t) {
  const app = t.page.locator('#app');
  const field = id => app.locator(`[data-test-id="${id}"] input`);
  const mathCategory = app.locator('.category-name').filter({ hasText: /^Math$/ });
  const mathTool = mathCategory.locator('..').getByRole('link', { name: 'Percentage calculator' });

  await t.step('Toggle the Math tools list', async () => {
    await t.click(mathCategory);
  }, [
    t.hidden('Math tools are collapsed', mathTool)
  ]);

  await t.step('Find and open Percentage calculator under Math', async () => {
    await t.click(mathCategory);
    await t.click(mathTool);
  }, [
    t.visible('Listed under Math', mathTool),
    t.visible('Calculator opened', app.getByRole('heading', { name: 'Percentage calculator' }))
  ], { covers: ['math-tool-listing'] });

  await t.step('A result stays empty while the second input is missing', async () => {
    await t.fill(field('percentageX'), '123');
  }, [
    t.value('Percentage entered', field('percentageX'), '123'),
    t.value('Result remains empty', field('percentageResult'), '')
  ], { covers: ['incomplete-input'] });

  await t.step('Calculate 123% of 456', async () => {
    await t.fill(field('percentageY'), '456');
  }, [
    t.value('123% of 456 is 560.88', field('percentageResult'), '560.88')
  ], { covers: ['percentage-of-value'] });

  await t.step('Find what percentage 123 is of 456', async () => {
    await t.fill(field('numberX'), '123');
    await t.fill(field('numberY'), '456');
  }, [
    t.value('123 is 26.973684210526315% of 456', field('numberResult'), '26.973684210526315')
  ], { covers: ['value-as-percentage'] });

  await t.step('A zero base leaves the percentage result empty', async () => {
    await t.fill(field('numberY'), '0');
  }, [
    t.value('Base value is zero', field('numberY'), '0'),
    t.value('Percentage result is empty', field('numberResult'), '')
  ], { covers: ['zero-denominator'] });

  await t.step('Calculate the increase from 123 to 456', async () => {
    await t.fill(field('numberFrom'), '123');
    await t.fill(field('numberTo'), '456');
  }, [
    t.value('Increase is 270.7317073170732%', field('percentageIncreaseDecrease'), '270.7317073170732')
  ], { covers: ['percentage-change'] });
}
