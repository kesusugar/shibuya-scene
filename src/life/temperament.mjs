// How a person answers being hit, and how a hit lands on them. RUN 11.2.
//
// Deterministic by id, built on the same nerve `traitsOf` gives awareness, so a person is one
// character everywhere: the nervous one who bolts from a runner is the one who bolts when
// punched, and the steady one who ignores small things is the one who hits back. Before
// this, everyone punched became hostile for 14 s and walked back to fight.
import {traitsOf} from './hq-awareness.mjs';

export const RESPONSE=Object.freeze({FIGHT:'fight',FLEE:'flee',BACK_OFF:'backoff'});

export const BLOW=Object.freeze({
 light:{hold:.34,push:.9},      // a jab: a flinch, a half step back
 strong:{hold:.55,push:1.7},    // a cross: a real stagger
 cooldownFlee:4.5,              // s the flight lasts in the simulation
 cooldownBackOff:1.6
});

/** What this person does when hit. Elderly people and kids never square up. */
export function responseOf(id,{archetype=null,gray=false}={}){
 if(archetype==='kid')return RESPONSE.FLEE;
 const n=traitsOf(id).nerve;
 if(gray)return n>.6?RESPONSE.BACK_OFF:RESPONSE.FLEE;
 return n>.68?RESPONSE.FIGHT:n<.42?RESPONSE.FLEE:RESPONSE.BACK_OFF;
}

/**
 * How one blow lands: strength from the attack, direction from attacker to victim (so a punch
 * from the front sends the victim back and one from the side sends them sideways), and what
 * state and follow-up the crowd should show.
 */
export function blowOn(attacker,victim,{attack='Punch',fatal=false}={}){
 let dx=victim.x-attacker.x,dz=victim.z-attacker.z;const d=Math.hypot(dx,dz);
 if(d>1e-6){dx/=d;dz/=d;}else{const h=attacker.heading??0;dx=Math.sin(h);dz=Math.cos(h);}
 const strength=attack==='PunchCross'?'strong':'light';
 const b=BLOW[strength];
 // Which side of the victim it came from, in their own frame: front, back, left, right.
 const vh=victim.heading??0,fx=Math.sin(vh),fz=Math.cos(vh);
 const from=-(dx*fx+dz*fz),side=dx*Math.cos(vh)-dz*Math.sin(vh);
 const quarter=Math.abs(from)>=Math.abs(side)?(from>0?'front':'back'):(side>0?'left':'right');
 return {strength,quarter,dirX:dx,dirZ:dz,push:b.push,hold:b.hold,fatal,
  impulse:{x:dx*b.push,z:dz*b.push,y:0}};
}

/** The share of a population that answers each way, for the record and the tests. */
export function responseMix(ids,opts){
 const out={fight:0,flee:0,backoff:0};
 for(const id of ids)out[responseOf(id,opts)]++;
 return out;
}
