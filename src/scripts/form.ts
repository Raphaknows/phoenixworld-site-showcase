import { clearBlueprintPick, getBlueprintPick } from './blueprints';
import { calcUsed, getEstimate } from './calc';
import { $ } from './util';

// The form ID comes from PUBLIC_FORMSPREE_ID at build time (see .env.example).
const FORM_ID = import.meta.env.PUBLIC_FORMSPREE_ID || 'FORMSPREE_FORM_ID';
const ENDPOINT = `https://formspree.io/f/${FORM_ID}`;
const CONTACT = 'hello@phoenixworld.ai';

export function initForm(): void {
  const form = $<HTMLFormElement>('auditForm');
  const status = $('formStatus');
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const email = $<HTMLInputElement>('f-email');

  const say = (msg: string, ok: boolean): void => {
    status.classList.toggle('err', !ok);
    status.style.color = ok ? 'var(--ok)' : 'var(--ember)';
    status.textContent = msg;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const missing = [...form.querySelectorAll<HTMLInputElement>('[required]')].filter((i) => !i.value.trim());
    if (missing.length) {
      say('Add your ' + missing.map((i) => i.name).join(', ') + ' to request the audit.', false);
      missing[0].focus();
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.value)) {
      say('Check the email address: it should look like name@company.com.', false);
      email.focus();
      return;
    }

    const est = getEstimate();
    const pick = getBlueprintPick();
    const company = $<HTMLInputElement>('f-company').value.trim();
    const name = $<HTMLInputElement>('f-name').value.trim();
    const payload = {
      name,
      company,
      email: email.value.trim(),
      workflow: $<HTMLSelectElement>('f-workflow').value,
      blueprint: pick ? pick.name : 'None picked',
      ...(calcUsed()
        ? {
            calculator_estimate: est.summary,
            calculator_inputs:
              `${est.people} people, $${est.ratePerHour}/h, ${est.hoursPerWeek} h/week each, ` +
              `${est.automatablePct}% estimated automatable`,
          }
        : { calculator_estimate: 'Not used' }),
      message: [pick?.note, $<HTMLTextAreaElement>('f-message').value.trim()].filter(Boolean).join('\n\n'),
      _subject: `Audit request: ${company}`,
      _gotcha: $<HTMLInputElement>('f-hp').value,
    };

    button.disabled = true;
    say('Sending…', true);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      clearBlueprintPick();
      $('formInterest').hidden = true;
      say(`Request received, ${name}. We'll email you at ${payload.email} to set up your 20 minutes.`, true);
    } catch {
      say(`That didn't send. Please try again, or email us at ${CONTACT}.`, false);
    } finally {
      button.disabled = false;
    }
  });
}
