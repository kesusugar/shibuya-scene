import sys
root='/home/user/shibuya-scene/'
def edit(path,pairs):
    s=open(root+path).read()
    for a,b in pairs:
        if s.count(a)!=1: sys.exit(f'{path}: {s.count(a)} x {a[:70]!r}')
        s=s.replace(a,b)
    open(root+path,'w').write(s)

# ---- figure ----
edit('src/player/figure.mjs',[
("import {createHands} from './hands.mjs';","import {createHands} from './hands.mjs';\nimport {createHandsUp,createLimp,createUpperPose} from './body-states.mjs';"),
("const looping=new Set(['Idle','Walk','Run','Sprint','Death','Guard','Drive','SwordIdle','PistolIdle','CrouchWalk']);",
 "const looping=new Set(['Idle','Walk','Run','Sprint','Death','Guard','Drive','SwordIdle','PistolIdle','CrouchWalk','Crawl']);"),
("const SWINGS=new Set([...PUNCHES,'SwordAttack','Roll']);",
 "// Roadmap stage 2: crawling owns the whole body the same way (it is Swim_Fwd_Loop laid on the ground).\nconst SWINGS=new Set([...PUNCHES,'SwordAttack','Roll','Crawl']);"),
(" if(state.vehiclePhase>0)return state.vehicleKind==='exit'?'Exit':'Enter';",
 " if(state.vehiclePhase>0)return state.vehicleKind==='exit'?'Exit':'Enter';\n // Roadmap stage 2: down on the ground with a leg wound, dragging themselves away.\n if(state.crawling)return 'Crawl';"),
("const UNGROUNDED=new Set(['Fall','Death','Enter','Exit','Drive','Roll']);","const UNGROUNDED=new Set(['Fall','Death','Enter','Exit','Drive','Roll','Crawl']);\n/** Stage 2: how high the crawl's root sits (the clip is a swim, centred on the chest), and its authored pace. */\nexport const CRAWL=Object.freeze({lift:.36,pace:.55});"),
(" const strike={Punch:0,PunchCross:0,SwordAttack:0,Roll:0};"," const strike={Punch:0,PunchCross:0,SwordAttack:0,Roll:0,Crawl:0};"),
(" // §9ai: a blow you can see land"," // Roadmap stage 2: hands up at gunpoint, a limp, and the katana's guard held while walking.\n const handsUp=root.getObjectByName('upperarm_l')?createHandsUp(root):null;\n const limp=root.getObjectByName('calf_r')?createLimp(root):null;\n const swordWalk=weaponRig&&weapons.includes('katana')?createUpperPose(root,instance.clips,'SwordIdle'):null;\n let swordK=0;\n // §9ai: a blow you can see land"),
("     // W4: the roll is scrubbed by its own clock, not the attack's.\n     if(overlay==='Roll')time=duration*(1-(state.rollTime??0)/(state.rollDuration||duration));",
 "     // W4: the roll is scrubbed by its own clock, not the attack's.\n     if(overlay==='Roll')time=duration*(1-(state.rollTime??0)/(state.rollDuration||duration));\n     // Stage 2: the crawl loops at the pace the body is dragging itself.\n     if(overlay==='Crawl'){time=null;action.timeScale=Math.max(.25,Math.min(2,speed/CRAWL.pace));}"),
("   root.position.set(state.x,state.y,state.z);\n   root.rotation.set(0,facing.heading,facing.lean,'YXZ');",
 "   root.position.set(state.x,state.y+(overlay==='Crawl'?CRAWL.lift*strike.Crawl:0),state.z);\n   root.rotation.set(0,facing.heading,overlay==='Crawl'?0:facing.lean,'YXZ');"),
("   const posed=inHand!==(state.weapon??null)?{...state,weapon:inHand,aim:0,shotLeft:0}:state;",
 "   const posed=inHand!==(state.weapon??null)?{...state,weapon:inHand,aim:0,shotLeft:0}:state;\n   // Stage 2: walking with the katana out, the upper body keeps the two-handed guard.\n   if(swordWalk){const on=inHand==='katana'&&!SWINGS.has(overlay)&&!UNGROUNDED.has(overlay)&&speed>LOCOMOTION.idleSpeed;\n    swordK+=Math.max(-dt/.2,Math.min(dt/.2,(on?1:0)-swordK));if(swordK>0)swordWalk.update(swordK*swordK*(3-2*swordK),dt);}"),
("   if(hands&&!SWINGS.has(overlay)&&!UNGROUNDED.has(overlay))hands.update(posed,dt);",
 "   if(hands&&!SWINGS.has(overlay)&&!UNGROUNDED.has(overlay))hands.update(posed,dt);\n   // Stage 2: hands up (over whatever the arms were doing), and the limp (before the feet are planted).\n   handsUp?.update(!!state.handsUp&&!SWINGS.has(overlay)&&!UNGROUNDED.has(overlay)&&state.alive!==false,dt);\n   limp?.update(!!state.limp&&!state.crawling&&!SWINGS.has(overlay)&&!UNGROUNDED.has(overlay),gait.phase,dt,speed>LOCOMOTION.idleSpeed);"),
("aimLayer?.reset();hands?.reset();","aimLayer?.reset();hands?.reset();handsUp?.reset();limp?.reset();swordK=0;strike.Crawl=0;"),
])

# ---- near characters ----
edit('src/life/near-characters.mjs',[
("const priorityOf=(p,clock)=>(p.aimedUntil>clock)||(clock-(p.hitAt??-1e9)<PRIORITY_HOLD);",
 "const priorityOf=(p,clock)=>(p.aimedUntil>clock)||(clock-(p.hitAt??-1e9)<PRIORITY_HOLD)\n // Roadmap stage 2: someone with their hands up, crawling, or shooting back is worth the detail.\n ||p.handsUpUntil>clock||!!p.crawling||(!p.officer&&!!p.gunDrawn);"),
("     ragdoll:fallen(p)?p.ragdoll:null,",
 "     ragdoll:fallen(p)?p.ragdoll:null,\n     // Roadmap stage 2: hands up at gunpoint, a leg wound's limp or crawl.\n     handsUp:p.handsUpUntil>clock,limp:!!p.limp,crawling:!!p.crawling,"),
("     ...(p.officer&&p.gunDrawn?{weapon:'revolver'","     // Stage 2: an armed civilian's handgun is drawn the same way.\n     ...(p.gunDrawn?{weapon:'revolver'"),
])

# ---- simulation ----
edit('src/life/simulation.mjs',[
("  if(p.combatTarget&&p.combatUntil>this.time&&!p.crossing){p.state='fighting';p.speed=0;return;}",
 "  if(p.combatTarget&&p.combatUntil>this.time&&!p.crossing){p.state='fighting';p.speed=0;return;}\n  // Roadmap stage 2 (street-reactions.mjs): hands up at gunpoint, or standing to shoot back.\n  if((p.handsUpUntil>this.time||p.shooterUntil>this.time)&&!p.crossing){p.state=p.shooterUntil>this.time?'shooting':'surrender';p.speed=0;p.flee=null;return;}"),
("  const going=f.left>0&&this.time<f.until,target=going?f.speed:0;",
 "  const going=f.left>0&&this.time<f.until,target=going?f.speed*woundedPace(p):0;"),
("  let speed=p.baseSpeed;\n","  let speed=p.baseSpeed*woundedPace(p);\n"),
("combatHealth:100,combatTarget:null,","combatHealth:100,combatTarget:null,limp:false,crawling:false,legWounds:0,handsUpUntil:0,handsUpSince:undefined,shooterUntil:0,gunDrawn:false,gunAim:0,"),
])
s=open(root+'src/life/simulation.mjs').read()
first=s.index('import ')
s=s[:first]+"import {woundedPace} from './street-reactions.mjs';\n"+s[first:]
open(root+'src/life/simulation.mjs','w').write(s)

# ---- combat: leg wounds ----
edit('src/player/combat.mjs',[
("   else if(!onRails(p)){p.combatTarget=null;crowd.flee?.(p,ux,uz,{urgency:1,from:state});}\n   // §9ai",
 "   else if(!onRails(p)){p.combatTarget=null;crowd.flee?.(p,ux,uz,{urgency:1,from:state});}\n   // Roadmap stage 2: a round in the legs that does not kill leaves them limping, or crawling.\n   if(!fatal&&part==='legs')legWound(p);\n   // §9ai"),
])
s=open(root+'src/player/combat.mjs').read()
first=s.index('import ')
s=s[:first]+"import {legWound} from '../life/street-reactions.mjs';\n"+s[first:]
open(root+'src/player/combat.mjs','w').write(s)
print('ok')

# ---- ragdoll: walls and cars ----
edit('src/player/ragdoll.mjs',[
("import {Matrix4,Quaternion,Vector3} from 'three';",
 """import {Matrix4,Quaternion,Vector3} from 'three';

/**
 * Roadmap stage 2: what a falling body can strike besides the ground -- the buildings' solid
 * cells and the cars nearby. `solid(x, z)` is the collision grid; `cars` a list of boxes
 * {x, z, y, heading, width, length, height}, refreshed by the scene each frame. Shared by every
 * ragdoll (there are at most four). Inelastic, like the ground: a point that meets a wall or a
 * car loses the motion that carried it in, so a body slumps against it instead of passing
 * through or bouncing off.
 */
const WORLD = {solid: null, cars: []};
export function setRagdollWorld({solid = null, cars = []} = {}) {WORLD.solid = solid; WORLD.cars = cars; return WORLD;}"""),
(""" function floor() {
  for (let i = 0; i < n; i++) {
   const r = i === I.Head || i === I.headTop ? RAGDOLL.headRadius : RAGDOLL.radius;
   if (pos[i].y < ground + r) {pos[i].y = ground + r; if (prev[i].y < pos[i].y) prev[i].y = pos[i].y;}
  }
 }""",""" function floor() {
  for (let i = 0; i < n; i++) {
   const r = i === I.Head || i === I.headTop ? RAGDOLL.headRadius : RAGDOLL.radius;
   if (pos[i].y < ground + r) {pos[i].y = ground + r; if (prev[i].y < pos[i].y) prev[i].y = pos[i].y;}
   // Stage 2: a wall stops the point where it met it (back to where it was, across the ground).
   if (WORLD.solid && WORLD.solid(pos[i].x, pos[i].z) && !WORLD.solid(prev[i].x, prev[i].z)) {
    pos[i].x = prev[i].x; pos[i].z = prev[i].z; hits.walls++;
   }
   for (const car of WORLD.cars) {
    const h = car.heading ?? 0, s = Math.sin(h), c = Math.cos(h), px = pos[i].x - car.x, pz = pos[i].z - car.z;
    const across = px * c - pz * s, along = px * s + pz * c, hw = car.width / 2 + r, hl = car.length / 2 + r;
    if (Math.abs(across) >= hw || Math.abs(along) >= hl || pos[i].y > (car.y ?? 0) + car.height + r) continue;
    // Out through the nearest face -- the roof if it came down onto the car.
    const up = (car.y ?? 0) + car.height + r - pos[i].y, sx = hw - Math.abs(across), sz = hl - Math.abs(along);
    if (up < Math.min(sx, sz) && prev[i].y >= (car.y ?? 0) + car.height) {pos[i].y += up; if (prev[i].y < pos[i].y) prev[i].y = pos[i].y;}
    else {
     const ax = sx < sz ? Math.sign(across || 1) * sx : 0, az = sx < sz ? 0 : Math.sign(along || 1) * sz;
     pos[i].x += ax * c + az * s; pos[i].z += -ax * s + az * c;
     prev[i].x = pos[i].x; prev[i].z = pos[i].z;
    }
    hits.cars++;
   }
  }
 }"""),
(" let active = false, asleep = false, age = 0, still = 0, ground = 0, carry = 0;"," let active = false, asleep = false, age = 0, still = 0, ground = 0, carry = 0;\n const hits = {walls: 0, cars: 0};"),
])
s=open(root+'src/player/ragdoll.mjs').read()
print('ragdoll ok', 'get hits' in s)
edit('src/player/ragdoll.mjs',[("  get asleep() {return asleep;},","  get asleep() {return asleep;},\n  /** Stage 2: how often a point has met a wall or a car (for tests and QA). */\n  get hits() {return {...hits};},")])
print('done')
