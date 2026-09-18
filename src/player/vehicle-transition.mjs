// Deterministic enter/exit motion. The selected traffic slot may be frozen first, but the
// player's pose always travels through the door instead of teleporting into the seat.
export const VEHICLE_TRANSITION=Object.freeze({enter:.78,exit:.9});
const smooth=t=>t*t*(3-2*t);
export function createVehicleTransition(){
 let action=null;
 return {
  begin(kind,from,to,slot=null){if(action)return false;action={kind,from:{...from},to:{...to},slot,time:0,duration:VEHICLE_TRANSITION[kind]};return true;},
  update(dt){if(!action)return null;action.time=Math.min(action.duration,action.time+Math.max(0,dt));const t=action.time/action.duration,k=smooth(t);
   const pose={x:action.from.x+(action.to.x-action.from.x)*k,z:action.from.z+(action.to.z-action.from.z)*k,
    heading:action.from.heading+Math.atan2(Math.sin(action.to.heading-action.from.heading),Math.cos(action.to.heading-action.from.heading))*k,
    phase:t,kind:action.kind,slot:action.slot,done:t>=1};if(pose.done)action=null;return pose;},
  get active(){return !!action;},cancel(){action=null;}
 };
}
