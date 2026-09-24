// The police, frame by frame: what the player did, what the police know, and what they sound and
// look like (PLAN-POLICE-AND-OWN-CAR W1 and W3). The scene hands this one object the systems it
// already has; the rules live in wanted.mjs and siren.mjs, which are pure.
import {createWanted,WANTED} from './wanted.mjs';
import {createSirens,createLoudspeaker} from './siren.mjs';

export const POLICE = Object.freeze({
 respondRange: 300,        // m: patrol cars this close run their sirens while the player is wanted
 witnessRange: 25,         // m: civilians this close to a fight see it
 ramSpeed: 2,              // m/s: slower than this, touching a patrol car is not ramming it
 ramRepeat: 3,             // s between two rams counting twice
 speakRange: 35            // m: the loudspeaker is used when a siren car is this close
});

/** Patrol cars that can see a point: in the traffic pool, not the player's, within sight range. */
export function officersSee(pool, x, z, except = null, range = WANTED.sightRange) {
 for (const v of pool ?? []) {
  if (!v.active || v.type !== 'police' || v === except) continue;
  if (Math.hypot(v.x - x, v.z - z) <= range) return true;
 }
 return false;
}

export function createPoliceDirector({getAudioContext = () => null, getAudioBus = () => null,
                                      speech = globalThis.speechSynthesis,
                                      Utterance = globalThis.SpeechSynthesisUtterance} = {}) {
 const wanted = createWanted();
 const sirens = createSirens(getAudioContext, getAudioBus);
 const speaker = createLoudspeaker(speech, Utterance);
 let deaths = 0, lastRam = -Infinity, taken = new WeakSet(), time = 0;
 const runovers = new Set();
 const sources = [];

 const api = {
  wanted, sirens,
  /** A carjack finished; an officer nearby makes it a crime. */
  carjack(slot, traffic) {
   if (!slot) return;
   wanted.crime('carjack', {x: slot.x, z: slot.z, t: time, seenByOfficer: officersSee(traffic?.pool, slot.x, slot.z, slot)});
  },
  /**
   * One frame. `player` is the on-foot state, `car` the player's vehicle object (or null),
   * `driving` whether the player is in it, `melee` the combat stats, `traffic` / `crowd` the sims.
   */
  frame(dt, {player, car = null, driving = false, melee = null, traffic = null, crowd = null, listener = null}) {
   time += dt;
   const me = driving && car ? car.state : player;
   const pool = traffic?.pool ?? [];
   const except = car?.state?.slot ?? null;

   // --- crimes -----------------------------------------------------------------------------
   const killed = melee?.npcDeaths ?? 0;
   if (killed < deaths) deaths = killed;          // combat was reset (a respawn)
   while (deaths < killed) {
    deaths++;
    let witnesses = 0;
    for (const p of crowd?.pool ?? []) {
     if (!p.active || p.combatDead || p.fatal) continue;
     if (Math.hypot(p.x - player.x, p.z - player.z) <= POLICE.witnessRange && ++witnesses >= 3) break;
    }
    wanted.crime('meleeKill', {x: player.x, z: player.z, t: time, witnesses,
     seenByOfficer: officersSee(pool, player.x, player.z, except)});
   }
   for (const e of car?.impacts ?? []) {
    if (e.kind !== 'runover' || runovers.has(e.id)) continue;
    runovers.add(e.id);
    wanted.crime('runoverKill', {x: e.x, z: e.z, t: time, id: 100000 + e.id});
   }
   if (driving && car?.state?.slot && car.state.type === 'police' && !taken.has(car.state.slot)) {
    taken.add(car.state.slot);
    wanted.crime('policeCarTaken', {x: car.state.x, z: car.state.z, t: time});
   }
   const rammed = car?.state?.rammed;
   if (rammed) {
    car.state.rammed = null;
    if (rammed.type === 'police' && Math.abs(car.state.speed ?? 0) >= POLICE.ramSpeed && time - lastRam >= POLICE.ramRepeat) {
     lastRam = time;
     wanted.crime('policeRam', {x: car.state.x, z: car.state.z, t: time});
    }
   }

   // --- what the police know --------------------------------------------------------------
   const seen = officersSee(pool, me.x, me.z, except);
   const snap = wanted.update(dt, {x: me.x, z: me.z, t: time, seen});
   if (player && player.alive === false && snap.stars) wanted.clear('death');

   // --- sirens and lamps --------------------------------------------------------------------
   sources.length = 0;
   const responding = wanted.state.stars > 0;
   for (const v of pool) {
    if (!v.active || v.type !== 'police') continue;
    if (v === except) {
     // The player's own patrol car runs its siren only when they switch it on (H).
     v.siren = !!car?.state?.siren && driving;
    } else v.siren = responding && Math.hypot(v.x - me.x, v.z - me.z) <= POLICE.respondRange;
    if (v.siren) {
     const speed = v === except ? car.state.speed ?? 0 : v.speed ?? 0;
     sources.push({id: v.id, x: v.x, z: v.z, vx: Math.sin(v.heading) * speed, vz: Math.cos(v.heading) * speed, mode: 'wail'});
    }
   }
   const ear = listener ?? {x: me.x, z: me.z, vx: 0, vz: 0};
   sirens.update(dt, sources, ear);
   if (responding && sources.some(s => s.id !== except?.id && Math.hypot(s.x - me.x, s.z - me.z) <= POLICE.speakRange))
    speaker.say(driving ? '前の車、止まりなさい' : 'そこの人、止まりなさい', time);
   return snap;
  },
  /** H in a patrol car: siren and lamps on or off. Returns false if this car has none. */
  toggleSiren(car) {
   if (!car?.state || car.state.type !== 'police') return false;
   car.state.siren = !car.state.siren;
   return true;
  },
  clear(reason) {wanted.clear(reason);},
  dispose() {sirens.dispose();}
 };
 return api;
}
