// Loaded into Playwright's processes by `pro-tour run`: `import … from 'pro-tour'` in a tour resolves to the
// pro-tour that is recording it, whether or not the app installed pro-tour, and never to another version.
// It loads as an ES module even when Playwright has compiled the tour to CommonJS (an app without
// "type": "module"), so a require() of it is a require of an ES module.
import { registerHooks } from 'node:module';

const source = import.meta.url.endsWith('.ts');
const target = new URL(`./index.${source ? 'ts' : 'js'}`, import.meta.url).href;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'pro-tour') return { url: target, format: source ? 'module-typescript' : 'module', shortCircuit: true };
    // Playwright's own test records no tour, and an app's copy of it would clash with the runner's.
    if (['@playwright/test', 'playwright/test'].includes(specifier) && /\.tour\.[jt]s$/.test(context.parentURL ?? ''))
      throw new Error(`Import test and expect from 'pro-tour', not from '${specifier}': pro-tour's test records the tour.`);
    return next(specifier, context);
  },
});
