import { $ } from './util';

export interface BlueprintPick {
  name: string;
  note: string;
  /** 'button' = visitor clicked "Build this for us"; 'link' = came from a #for-…--bp-NN link. */
  source: 'button' | 'link';
}

let pick: BlueprintPick | null = null;

export const getBlueprintPick = (): BlueprintPick | null => pick;
export const clearBlueprintPick = (): void => {
  pick = null;
};

export function initBlueprints(): void {
  const chips = document.querySelectorAll<HTMLButtonElement>('.chip');
  const cards = document.querySelectorAll<HTMLElement>('.bp');
  const count = $('bpCount');

  chips.forEach((ch) => {
    ch.addEventListener('click', () => {
      const cat = ch.getAttribute('data-cat');
      let n = 0;
      chips.forEach((c) => c.setAttribute('aria-pressed', c === ch ? 'true' : 'false'));
      cards.forEach((card) => {
        const show = cat === 'all' || card.getAttribute('data-cat') === cat;
        card.hidden = !show;
        if (show) n++;
      });
      count.textContent = String(n);
    });
  });

  document.querySelectorAll<HTMLElement>('[data-bp]').forEach((a) => {
    a.addEventListener('click', () => applyPick(a, 'button'));
  });
  watchAnchorNavigation();
}

/** Same effect as pressing a "Build this for us" button: record the pick, note it, preselect the workflow. */
function applyPick(a: HTMLElement, source: BlueprintPick['source']): void {
  const name = a.getAttribute('data-bp') ?? '';
  const note = a.getAttribute('data-note') || 'Blueprint you picked: ' + name + '.';
  pick = { name, note, source };
  const fi = $('formInterest');
  fi.textContent = note;
  fi.hidden = false;
  const sel = $<HTMLSelectElement>('f-workflow');
  const wf = a.getAttribute('data-wf');
  for (let i = 0; i < sel.options.length; i++) if (sel.options[i].text === wf) sel.selectedIndex = i;
}

// ---------- suggested blueprint (from a #for-<slug>--bp-<NN> link) ----------

export interface Suggestion {
  name: string;
}

let suggestedCard: HTMLElement | null = null;
let suggestObserver: IntersectionObserver | null = null;

const cardFor = (num: string): HTMLElement | null =>
  [...document.querySelectorAll<HTMLElement>('.bp')].find((c) => c.querySelector('.bp-id')?.textContent === 'BP-' + num) ?? null;

// A click on an in-page link means the visitor chose where to go; don't fight their scroll.
let navigating = false;
function watchAnchorNavigation(): void {
  let timer = 0;
  const done = (): void => {
    navigating = false;
    clearTimeout(timer);
  };
  document.addEventListener('click', (e) => {
    if (!(e.target as Element | null)?.closest?.('a[href^="#"], a[href^="/#"]')) return;
    navigating = true;
    clearTimeout(timer);
    timer = window.setTimeout(done, 3500);
  });
  addEventListener('scrollend', done);
}

export function clearSuggestion(): void {
  suggestObserver?.disconnect();
  suggestObserver = null;
  if (suggestedCard) {
    suggestedCard.classList.remove('suggested');
    suggestedCard.querySelector('.bp-suggest')?.remove();
    suggestedCard = null;
  }
  if (pick?.source === 'link') {
    pick = null;
    $('formInterest').hidden = true;
  }
}

/**
 * Open the library on this blueprint's industry, highlight its card, prefill the audit form.
 * The page is not moved here; the card is scrolled into view only once the visitor reaches the Proof chapter.
 */
export function suggestBlueprint(num: string): Suggestion | null {
  const card = cardFor(num);
  if (!card) return null;
  clearSuggestion();
  document.querySelector<HTMLButtonElement>(`.chip[data-cat="${card.getAttribute('data-cat')}"]`)?.click();
  card.classList.add('suggested');
  const tag = document.createElement('span');
  tag.className = 'bp-suggest';
  tag.textContent = 'Suggested for you';
  card.prepend(tag);
  suggestedCard = card;
  const button = card.querySelector<HTMLElement>('[data-bp]');
  if (button) applyPick(button, 'link');

  const proof = document.getElementById('proof');
  if (proof && 'IntersectionObserver' in window) {
    suggestObserver = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || navigating || !suggestedCard || suggestedCard.hidden) return;
        const r = suggestedCard.getBoundingClientRect();
        const fullyVisible = r.top >= 0 && r.bottom <= innerHeight;
        suggestObserver?.disconnect();
        suggestObserver = null;
        if (!fullyVisible) {
          const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
          suggestedCard.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
        }
      },
      // Proof is thousands of px tall, so trigger on position (its top entering the upper ~70% of the screen), not on a ratio.
      { threshold: 0, rootMargin: '0px 0px -30% 0px' },
    );
    suggestObserver.observe(proof);
  }
  return { name: card.querySelector('h4')?.textContent ?? '' };
}
