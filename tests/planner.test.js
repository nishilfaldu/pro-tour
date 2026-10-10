import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { prContext } from '../src/planner.js';

async function app(files) {
  const root = await mkdtemp(join(tmpdir(), 'planner-test-'));
  for (const [path, body] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), body);
  }
  return root;
}

const sent = context => context.slice(2).map(part => part.split('\n')[0].replace(/^--- | ---$/g, ''));

test('a small app is sent whole, without tests, tours, declarations or credentials', async () => {
  const root = await app({
    'src/app.js': "import './view.js';",
    'src/view.js': 'export const view = 1;',
    'src/view.test.js': 'test',
    'src/types.d.ts': 'declare const x: number;',
    '.tours/feature.tour.js': 'tour',
    '.env.local': 'SECRET=1',
    'src/secrets/token.js': 'export const token = 1;',
  });
  assert.deepEqual(sent(await prContext({ diff: 'diff', src: root })), ['src/app.js', 'src/view.js']);
});

test('a large app sends the changed files and their neighbors, and resolves template components, and does not follow a hub\'s imports', async () => {
  const filler = 'x'.repeat(20_000);
  const tools = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`src/tools/tool${i}.js`, `// ${filler}`]));
  const root = await app({
    ...tools,
    'src/registry.js': Object.keys(tools).map(file => `import './${file.slice(4)}';`).join('\n'),
    'src/tools/new-tool.js': "import { format } from '../format.js';\nexport default format;",
    'src/format.js': 'export const format = value => value;',
    'src/page.js': "import tool from './tools/new-tool.js';",
    'src/tools/new-tool.vue': '<template><c-button :disabled="!value">Copy</c-button><TextArea /></template>',
    'src/ui/c-button/c-button.vue': '<template><button :class="{ disabled }"><slot /></button></template>',
    'src/ui/text-area.vue': '<template><textarea /></template>',
  });
  const context = await prContext({ diff: 'diff', src: root, changed: ['src/tools/new-tool.js', 'src/tools/new-tool.vue', 'src/registry.js'].map(file => join(root, file)) });
  assert.match(context[1], /files the PR changed and their direct neighbors/);
  assert.deepEqual(sent(context).sort(), ['src/format.js', 'src/page.js', 'src/registry.js', 'src/tools/new-tool.js', 'src/tools/new-tool.vue', 'src/ui/c-button/c-button.vue', 'src/ui/text-area.vue']);
});
