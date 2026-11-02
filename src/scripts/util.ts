export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');
export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
export const reduceMotion: boolean =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
