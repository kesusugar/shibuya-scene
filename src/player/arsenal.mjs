// The player's weapons in the scene (PLAN-WEAPONS). The scene hands this one object its systems
// each frame; the rules live in weapons.mjs (inventory), combat.mjs (the katana's cut),
// ballistics.mjs (where a bullet goes) and weapon-effects.mjs (what it looks like).
//
// It owns what the player is holding, and writes it onto the player's state as `weapon`, which
// is what the figure draws and combat reads.
import {createInventory,WEAPONS} from './weapons.mjs';
import {createWeaponEffects} from './weapon-effects.mjs';

export function createArsenal({effects = createWeaponEffects()} = {}) {
 const inventory = createInventory();
 let wasDriving = false;
 const stats = {switches: 0, clanks: 0};

 const api = {
  inventory, effects,
  get current() {return inventory.current;},
  get weapon() {return WEAPONS[inventory.current];},
  /** 1/2/3. Refused mid-swing (`busy`), while reloading, and in a car. */
  select(slot, {busy = false, driving = false} = {}) {
   if (driving) return false;
   const ok = inventory.select(slot, {busy});
   if (ok) stats.switches++;
   return ok;
  },
  cycle(step, {busy = false, driving = false} = {}) {
   if (driving) return false;
   const ok = inventory.cycle(step, {busy});
   if (ok) stats.switches++;
   return ok;
  },
  /**
   * What the feedback bus says about the weapons: a clank puts sparks on the wall.
   * Returns true if it was a weapon event.
   */
  event(e) {
   if (e.kind === 'blade_clank') {effects.burst(e.x, 1.2, e.z, {count: 18}); stats.clanks++; return true;}
   return false;
  },
  /**
   * One frame. `player` is the controller; `driving` whether the player is in a car (R18: a car
   * holsters everything, and stepping out brings back the fists).
   */
  frame(dt, {player, driving = false} = {}) {
   inventory.update(dt);
   if (driving && !wasDriving) inventory.holster();
   if (!driving && wasDriving) inventory.unholster();
   wasDriving = driving;
   if (player?.state) player.state.weapon = inventory.current;
   effects.update(dt);
  },
  /** Respawn or leaving play: fists, a full magazine, nothing in flight. */
  reset() {inventory.reset(); wasDriving = false;},
  snapshot() {return {...inventory.snapshot(), ...stats, effects: effects.stats};},
  dispose() {effects.dispose();}
 };
 return api;
}
