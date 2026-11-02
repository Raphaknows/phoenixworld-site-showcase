import { expect, test } from '@playwright/test';
// @ts-expect-error plain .mjs helper shared with `npm run launch:check`
import { findPlaceholders, findScriptPlaceholders } from '../scripts/launch-check.mjs';

test.describe('launch placeholder scanner', () => {
  test('finds visible text, attribute and entity-encoded placeholders', () => {
    const html = `<h1>Ship in [TIMELINE]</h1><p>[X] business days</p><img alt="[PHOTO]"><b>[E-commerce marketing &amp; ops engine]</b>`;
    expect(findPlaceholders(html).sort()).toEqual(['[E-commerce marketing & ops engine]', '[PHOTO]', '[TIMELINE]', '[X]'].sort());
  });
  test('ignores brackets inside script, style and comments; clean pages pass', () => {
    const html = `<style>a[href]{}</style><script>const a=[1,2];x[0]</script><!-- [TIMELINE] --><p>Ship in 10 business days.</p>`;
    expect(findPlaceholders(html)).toEqual([]);
  });
  test('flags known tokens baked into bundled JS', () => {
    expect(findScriptPlaceholders('e("Email us at [CONTACT EMAIL]")')).toEqual(['[CONTACT EMAIL]']);
    expect(findScriptPlaceholders('const a=[1,2]')).toEqual([]);
    // array indexing in minified bundles (three.js: z[X]) is not a placeholder
    expect(findScriptPlaceholders('for(let X=0;X<z.length;X++){const ie=z[X],se=y(ie[X])}')).toEqual([]);
    expect(findScriptPlaceholders('m("[X]")')).toEqual(['[X]']);
  });
});
