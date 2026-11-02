import { requestIgnite } from './bridge';
import { clearSuggestion, suggestBlueprint } from './blueprints';
import { SLUG_MAX, parseBlueprintHash, parsePersonalHash, slugToName } from './hash';
import { $ } from './util';

const cleanName = (s: string): string =>
  (s || '').replace(/[^\p{L}\p{N}&.\-' ]/gu, '').replace(/\s+/g, ' ').trim().slice(0, SLUG_MAX);

function ignite(raw: string, fromLink: boolean): boolean {
  const name = cleanName(raw);
  if (!name) return false;
  if (fromLink) {
    const prepared = $('prepared');
    prepared.textContent = 'Prepared for ' + name;
    prepared.hidden = false;
  }
  const co = document.getElementById('f-company') as HTMLInputElement | null;
  if (co && !co.value) co.value = name;
  // Only the visitor's own Ignite press may move the page; a link must never yank them around.
  requestIgnite(name, fromLink ? 6500 : 4500, !fromLink);
  return true;
}

// #bp-<NN>: blueprint only. No company, so no "Prepared for" line, no name in the particles, no company prefill.
function fromBlueprintHash(num: string): void {
  const suggestion = suggestBlueprint(num);
  if (!suggestion) return;
  // If an earlier personal link left a "Suggested system" line in the hero, keep it truthful.
  const line = document.querySelector<HTMLElement>('#prepared .suggest');
  if (line) line.textContent = 'Suggested system: ' + suggestion.name;
}

function fromHash(): void {
  const bp = parseBlueprintHash(location.hash);
  if (bp) return fromBlueprintHash(bp);
  const link = parsePersonalHash(location.hash);
  if (!link) return; // any other hash (nav clicks, #audit...) must leave a suggestion alone
  clearSuggestion();
  const prepared = $('prepared');
  const name = slugToName(link.slug);
  $<HTMLInputElement>('f-co').value = name;
  // A valid blueprint opens the library on its own industry; otherwise the plain link behaves as before.
  const suggestion = link.blueprint && cleanName(name) ? suggestBlueprint(link.blueprint) : null;
  if (!suggestion) document.querySelector<HTMLButtonElement>('.chip[data-cat="logistics"]')?.click();
  ignite(name, true);
  if (suggestion) {
    const who = document.createElement('span');
    who.textContent = 'Prepared for ' + cleanName(name);
    const what = document.createElement('span');
    what.className = 'suggest';
    what.textContent = 'Suggested system: ' + suggestion.name;
    prepared.replaceChildren(who, what);
  }
}

export function initReborn(): void {
  $('igniter').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $<HTMLInputElement>('f-co');
    if (!ignite(inp.value, false)) inp.focus();
  });
  window.addEventListener('hashchange', fromHash);
  fromHash();
}
