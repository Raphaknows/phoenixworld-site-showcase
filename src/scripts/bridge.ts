// Shared state between the page's DOM modules and the WebGL stage island.
// The stage loads on demand, so anything sent before it is ready is held here.

export interface StageApi {
  /** `scrollToHero`: bring the hero back into view so the visitor sees the name form (only for their own action). */
  ignite(name: string, hold: number, scrollToHero: boolean): void;
}

export const bridge = {
  /** 0..1, driven by the burn calculator; the stage eases toward it. */
  heat: 0.6,
  stage: null as StageApi | null,
  pendingIgnite: null as { name: string; hold: number; scrollToHero: boolean } | null,
};

export function requestIgnite(name: string, hold: number, scrollToHero: boolean): void {
  if (bridge.stage) bridge.stage.ignite(name, hold, scrollToHero);
  else bridge.pendingIgnite = { name, hold, scrollToHero };
}

export function attachStage(api: StageApi): void {
  bridge.stage = api;
  if (bridge.pendingIgnite) {
    const { name, hold, scrollToHero } = bridge.pendingIgnite;
    bridge.pendingIgnite = null;
    api.ignite(name, hold, scrollToHero);
  }
}
