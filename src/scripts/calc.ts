import { bridge } from './bridge';
import { $, clamp, fmt } from './util';

export interface Estimate {
  people: number;
  ratePerHour: number;
  hoursPerWeek: number;
  automatablePct: number;
  annualCostUsd: number;
  annualHours: number;
  summary: string;
}

let current: Estimate;
let touched = false;

export const getEstimate = (): Estimate => current;

/** True once the visitor has changed at least one calculator input (the defaults are only an example). */
export const calcUsed = (): boolean => touched;

export function initCalc(): void {
  const cPeople = $<HTMLInputElement>('c-people');
  const cRate = $<HTMLInputElement>('c-rate');
  const cHours = $<HTMLInputElement>('c-hours');
  const cShare = $<HTMLInputElement>('c-share');

  function calc(): void {
    const people = clamp(parseFloat(cPeople.value) || 0, 0, 500);
    const rate = clamp(parseFloat(cRate.value) || 0, 0, 500);
    const hours = clamp(parseFloat(cHours.value) || 0, 0, 60);
    const share = clamp(parseFloat(cShare.value) || 0, 0, 100) / 100;
    const h = people * hours * 50;
    const cost = h * rate;
    $('o-hours').textContent = hours + ' h';
    $('o-share').textContent = Math.round(share * 100) + '%';
    $('r-cost').textContent = '$' + fmt(cost);
    $('r-hours').textContent = fmt(h);
    $('r-save').textContent = '$' + fmt(cost * share);
    $('r-save-h').textContent = fmt(h * share) + ' hours';
    bridge.heat = clamp(Math.log10(Math.max(cost, 1000) / 1000) / 3, 0, 1);
    $('heatBar').style.setProperty('--h', (bridge.heat * 100).toFixed(1) + '%');
    const summary = '$' + fmt(cost) + ' a year (' + fmt(h) + ' hours) on manual work';
    current = {
      people,
      ratePerHour: rate,
      hoursPerWeek: hours,
      automatablePct: Math.round(share * 100),
      annualCostUsd: Math.round(cost),
      annualHours: Math.round(h),
      summary,
    };
    $('formEstimate').textContent = "From your calculator: " + summary + ". We'll bring this to the audit.";
    $('formEstimate').hidden = !touched;
  }

  [cPeople, cRate, cHours, cShare].forEach((el) =>
    el.addEventListener('input', () => {
      touched = true;
      calc();
    }),
  );
  calc();
}
