import { $ } from './util';

export function setSeq(p: number): void {
  const v = Math.round(p * 100);
  $('seqFill').style.width = v + '%';
  $('seqPct').textContent = ('00' + v).slice(-3) + '%';
}
export const setSeqState = (text: string): void => {
  $('seqState').textContent = text;
};
