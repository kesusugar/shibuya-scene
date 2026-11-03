// The weapons you can see (PLAN-WEAPONS W1, R3). Generic shapes built in code: an automatic
// pistol, a revolver and a katana with its scabbard. No model is downloaded and no real maker's
// design is copied; each is a handful of boxes and cylinders in the silhouette of its kind.
//
// Cost: one shared material, vertex colours for steel, grip and lacquer, and one geometry per
// shape built once for the whole scene. A carried weapon is one mesh on a bone: drawn in the
// hand, or holstered at the hip or on the back. Three draw calls for an armed player, one for an
// officer's revolver.
import {BoxGeometry,BufferAttribute,BufferGeometry,Color,CylinderGeometry,Matrix4,Mesh,MeshStandardMaterial,
 Quaternion,Vector3,Euler} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {GRIP,SHAPE} from './weapons.mjs';

const COLOUR=Object.freeze({gunmetal:0x2b2d31,black:0x151517,steel:0x3c4047,wood:0x5b3a22,
 blade:0xc9ced6,hamon:0xe8ebef,tsuba:0x3f3526,wrap:0x1d1b26,saya:0x0f0d0e,holster:0x1a1614,
 // Katana A: the scabbard's lacquer (a deep warm black, not the flat dead black it was, so its
 // curve catches the light), its horn fittings, the silk cord (sageo) and the handle's same-skin
 // showing between the wraps.
 lacquer:0x24161a,horn:0x3a2a22,sageo:0x2c3564,samegawa:0xc9c2b0});

/** A box in the weapon's frame (+Z forward, +Y up, metres), painted one colour. */
function part(geometry,colour,{at=[0,0,0],rx=0,ry=0,rz=0}={}){
 const g=geometry.index?geometry.toNonIndexed():geometry;
 for(const k of Object.keys(g.attributes))if(k!=='position'&&k!=='normal')g.deleteAttribute(k);
 g.applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(rx,ry,rz)).setPosition(...at));
 const c=new Color(colour),n=g.attributes.position.count,col=new Float32Array(n*3);
 for(let i=0;i<n;i++){col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;}
 g.setAttribute('color',new BufferAttribute(col,3));
 return g;
}
const box=(w,h,l,colour,o)=>part(new BoxGeometry(w,h,l),colour,o);
/** A cylinder along +Z. */
const tube=(r,l,colour,{at=[0,0,0],sides=10,r2=r}={})=>part(new CylinderGeometry(r2,r,l,sides),colour,{at,rx:Math.PI/2});

/**
 * The katana blade: a diamond section (edge along +Y, a thin back along -Y), tapering to a
 * point, with a slight curve (sori) away from the edge. Built as a strip, not boxes, because a
 * box blade reads as a plank.
 */
function blade(start,length,colour,edge){
 const N=14,{sori}=SHAPE.katana,pos=[],col=[],a=new Color(colour),b=new Color(edge);
 const ring=[];
 for(let i=0;i<=N;i++){
  const s=i/N,z=start+s*length,bend=-sori*s*s*4;
  const w=i===N?0:.031*(1-.35*s)*(s>.9?(1-s)/.1:1),t=.0075*(1-.4*s);
  ring.push([[0,bend+w*.62,z],[t/2,bend,z],[0,bend-w*.38,z],[-t/2,bend,z]]);
 }
 const quad=(p,q,r,u,c)=>{for(const v of [p,q,r,p,r,u]){pos.push(...v);col.push(c.r,c.g,c.b);}};
 for(let i=0;i<N;i++)for(let k=0;k<4;k++){
  const k2=(k+1)%4,c=k===0||k===3?b:a;           // the two faces that meet at the edge are the hamon
  quad(ring[i][k],ring[i+1][k],ring[i+1][k2],ring[i][k2],c);
 }
 const g=new BufferGeometry();
 g.setAttribute('position',new BufferAttribute(new Float32Array(pos),3));
 g.setAttribute('color',new BufferAttribute(new Float32Array(col),3));
 g.computeVertexNormals();
 return g;
}

/**
 * Katana A: the scabbard (saya), curved like the blade it holds (the same sori, away from the edge,
 * which faces +Y), an oval section a little over the blade's width, from the mouth at `start` to
 * `start + length`, narrowing toward the end. A strip like the blade, so the curve reads.
 */
function sayaBody(start,length,colour){
 const N=12,S=10,{sori}=SHAPE.katana,pos=[],col=[],c=new Color(colour),ring=[];
 for(let i=0;i<=N;i++){
  const s=i/N,z=start+s*length,bend=-sori*s*s*4,w=.0125*(1-.18*s),h=.019*(1-.12*s);
  const r=[];for(let k=0;k<S;k++){const a=k/S*Math.PI*2;r.push([Math.cos(a)*w,bend+Math.sin(a)*h,z]);}
  ring.push(r);
 }
 const tri=(p,q,r)=>{for(const v of [p,q,r]){pos.push(...v);col.push(c.r,c.g,c.b);}};
 for(let i=0;i<N;i++)for(let k=0;k<S;k++){const k2=(k+1)%S;tri(ring[i][k],ring[i+1][k],ring[i+1][k2]);tri(ring[i][k],ring[i+1][k2],ring[i][k2]);}
 // Closed at the end (the kojiri cap covers it) and open at the mouth (the guard sits on it).
 const e=[0,-sori*4,start+length];for(let k=0;k<S;k++)tri(ring[N][k],e,ring[N][(k+1)%S]);
 const g=new BufferGeometry();
 g.setAttribute('position',new BufferAttribute(new Float32Array(pos),3));
 g.setAttribute('color',new BufferAttribute(new Float32Array(col),3));
 g.computeVertexNormals();
 return g;
}
/** The scabbard's fittings: the mouth ring (koiguchi), the cord knob (kurikata) with its cord, the end cap. */
function sayaFittings(start,length){
 const {sori}=SHAPE.katana,end=start+length;
 return [
  tube(.02,.022,COLOUR.horn,{at:[0,0,start+.011],sides:12}),                       // koiguchi
  box(.01,.016,.03,COLOUR.horn,{at:[0,-.024,start+.12]}),                           // kurikata, on the back
  tube(.0145,.05,COLOUR.sageo,{at:[0,-.001,start+.13],sides:10}),                  // sageo wound round it
  box(.006,.05,.012,COLOUR.sageo,{at:[.004,-.05,start+.15],rx:.5}),                 // and its hanging loop
  tube(.0115,.035,COLOUR.horn,{at:[0,-sori*4*.97,end-.012],sides:10,r2:.0135})    // kojiri
 ];
}
/** The handle (tsuka): same-skin under a diamond-crossed wrap, and the pommel cap. */
function tsuka(handle){
 const parts=[box(.028,.032,handle,COLOUR.samegawa,{at:[0,0,.05-handle/2]})],n=7,len=handle-.03;
 // The wrap crosses over the same-skin in pairs, leaving the diamonds (hishigami) showing.
 for(let i=0;i<n;i++){const z=.05-.012-(i+.5)*len/n;
  // Flat bands, each rolled a little the other way round the handle, so they cross without
  // standing proud of it (tilting them along the handle made a saw edge).
  parts.push(box(.03,.034,len/n*.56,COLOUR.wrap,{at:[0,0,z],rz:(i%2?.5:-.5)}));}
 parts.push(box(.03,.034,.02,COLOUR.horn,{at:[0,0,.05-handle+.01]}));              // kashira
 return parts;
}

const BUILD={
 // An automatic pistol: slide, frame, an angled grip, a trigger guard. The muzzle is SHAPE.pistol.
 pistol:()=>[
  box(.027,.03,.2,COLOUR.gunmetal,{at:[0,.062,.065]}),
  box(.025,.02,.15,COLOUR.black,{at:[0,.039,.05]}),
  box(.029,.115,.044,COLOUR.black,{at:[0,-.012,-.008],rx:-.28}),
  box(.006,.006,.045,COLOUR.black,{at:[0,.012,.04]}),
  box(.006,.024,.006,COLOUR.black,{at:[0,.022,.062]}),
  box(.004,.008,.01,COLOUR.black,{at:[0,.08,.15]}),
 ],
 // A revolver: a round barrel over an ejector rod, the cylinder, the frame, a hammer and a wooden
 // grip. The muzzle is SHAPE.revolver.
 revolver:()=>[
  tube(.0095,.105,COLOUR.steel,{at:[0,.07,.137]}),
  tube(.005,.07,COLOUR.steel,{at:[0,.055,.115]}),
  tube(.019,.042,COLOUR.steel,{at:[0,.062,.058],sides:12}),
  box(.02,.036,.05,COLOUR.steel,{at:[0,.064,.02]}),
  box(.007,.012,.016,COLOUR.steel,{at:[0,.088,.004],rx:.5}),
  box(.028,.1,.038,COLOUR.wood,{at:[0,-.005,-.018],rx:-.32}),
  box(.006,.006,.035,COLOUR.steel,{at:[0,.02,.045]}),
  box(.004,.008,.008,COLOUR.steel,{at:[0,.086,.186]}),
 ],
 // A katana: handle (tsuka) behind the fist, a guard (tsuba), the collar (habaki) and the blade.
 katana:()=>{
  const {handle,tip}=SHAPE.katana,bladeStart=.085;
  return [
   ...tsuka(handle),
   tube(.017,.012,COLOUR.tsuba,{at:[0,0,.05-handle-.004]}),
   part(new CylinderGeometry(.042,.042,.008,14),COLOUR.tsuba,{at:[0,0,.066],rx:Math.PI/2}),
   box(.012,.034,.014,COLOUR.tsuba,{at:[0,.002,.077]}),
   blade(bladeStart,tip-bladeStart,COLOUR.blade,COLOUR.hamon),
  ];
 },
 // §9ah: a generic submachine gun, built to the numbers its clips were baked against (SHAPE.smg):
 // the pistol grip at the origin, the butt plate 0.33 m behind it, the fore-end the left hand
 // closes on 0.28 m ahead, the rear sight's top 0.115 m up, the muzzle at SHAPE.smg.muzzle.
 smg:()=>{
  const {muzzle,butt,foreEnd}=SHAPE.smg;
  return [
   box(.03,.1,.042,COLOUR.black,{at:[0,-.018,-.004],rx:-.25}),           // pistol grip
   box(.044,.064,.3,COLOUR.gunmetal,{at:[0,.055,.08]}),                  // receiver
   box(.05,.05,.16,COLOUR.black,{at:[0,.045,foreEnd]}),                  // fore-end
   tube(.012,muzzle[2]-.33,COLOUR.steel,{at:[0,muzzle[1],(muzzle[2]+.33)/2]}),   // barrel
   box(.022,.03,.26,COLOUR.black,{at:[0,.05,-.16]}),                     // stock, top bar
   box(.022,.022,.2,COLOUR.black,{at:[0,.005,-.2],rx:-.12}),             // stock, lower bar
   box(.036,.095,.02,COLOUR.black,{at:[0,butt[1]-.005,butt[2]+.01]}),     // butt plate
   box(.012,.03,.02,COLOUR.black,{at:[0,.1,-.05]}),                      // rear sight (its top at SHAPE.smg.sight)
   box(.006,.022,.008,COLOUR.black,{at:[0,.095,.23]}),                   // front sight
   box(.006,.008,.04,COLOUR.black,{at:[0,.012,.03]})                     // trigger guard
  ];
 },
 // Stage 1: the submachine gun's magazine, its own mesh so a reload can take it out of the gun.
 // Built about its own top (where it seats), which sits at SMG_MAG in the gun's frame.
 smgMag:()=>[box(.028,.13,.034,COLOUR.black,{at:[0,-.065,0],rx:.12})],
 // The katana in its scabbard, worn at the left hip (Katana A): the same handle and guard, and the
 // curved lacquered saya with its fittings over the blade's length.
 sheathed:()=>{
  const {handle,tip}=SHAPE.katana;
  return [
   ...tsuka(handle),
   part(new CylinderGeometry(.042,.042,.008,14),COLOUR.tsuba,{at:[0,0,.066],rx:Math.PI/2}),
   sayaBody(.072,tip-.05,COLOUR.lacquer),...sayaFittings(.072,tip-.05)
  ];
 },
 // The scabbard alone, while the katana is in the hand.
 saya:()=>{const {tip}=SHAPE.katana;return [sayaBody(.072,tip-.05,COLOUR.lacquer),...sayaFittings(.072,tip-.05)];},
 // The pistol in a hip holster: only the grip and the back of the slide show above the leather.
 holstered:()=>[
  box(.036,.05,.2,COLOUR.holster,{at:[0,.05,.075]}),
  box(.029,.115,.044,COLOUR.black,{at:[0,-.012,-.008],rx:-.28}),
  box(.027,.03,.04,COLOUR.gunmetal,{at:[0,.062,-.02]}),
 ]
};

/** Stage 1: where the magazine seats, in the submachine gun's frame (its top, in the receiver). */
export const SMG_MAG=Object.freeze([0,.03,.148]);

const geometries=new Map();
let material=null;
/** One geometry per shape, for the whole scene. */
export function weaponGeometry(kind){
 if(!geometries.has(kind)){
  const g=mergeGeometries(BUILD[kind]());
  g.computeBoundingSphere();g.name=`weapon-${kind}`;
  geometries.set(kind,g);
 }
 return geometries.get(kind);
}
export function weaponMaterial(){
 return material??=new MeshStandardMaterial({name:'weapon',vertexColors:true,metalness:.55,roughness:.38});
}

const basis=(forward,up)=>{
 const z=new Vector3(...forward).normalize(),x=new Vector3(...up).cross(z).normalize(),y=z.clone().cross(x);
 return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,z));
};

/**
 * Where the holstered weapons sit, in the figure's root frame at its Idle pose (+Z forward, +Y
 * up, right is -X). Converted to the carrying bone's frame once, when the rig is built, so the
 * bone's own axis convention (the skeleton is Z-up in bone space) never has to be reasoned about.
 */
const CARRY=Object.freeze({
 // The pistol at the right hip, muzzle down, the slide's top facing forward.
 hip:{bone:'pelvis',at:[-.185,.93,-.02],forward:[0,-1,.08],up:[0,.08,1],kind:'holstered'},
 // The katana across the back, the handle over the right shoulder and the scabbard's end at the
 // left hip, the edge facing out. (No longer used for the katana: see `obi`.)
 back:{bone:'spine_03',at:[-.2,1.46,-.19],forward:[.42,-.9,0],up:[0,0,-1],kind:'sheathed'},
 // Katana A: the katana worn as it is worn -- thrust through the sash at the left hip, edge up, the
 // handle forward and a little up across the belly, the scabbard running back past the left
 // thigh, angled out and down so the leg swings clear of it. The right hand reaches across the
 // body to draw it, which is what a draw from here is.
 obi:{bone:'pelvis',at:[.1,.99,.13],forward:[.2,-.36,-.91],up:[0,.93,-.36],kind:'sheathed'},
 // Stage 1: the submachine gun slung behind the right shoulder, muzzle down to the left, the grip
 // where the right hand finds it over the shoulder blade.
 // Katana A: still where the hand fetches it from and puts it back (hands.mjs), but no longer drawn
 // there -- see SHOW_SLUNG_SMG.
 sling:{bone:'spine_03',at:[-.17,1.33,-.2],forward:[.3,-.95,0],up:[0,0,-1],kind:'smg'}
});

/**
 * Katana A: the slung submachine gun is not drawn on the back. At 0.6 m it read, from every side,
 * as a long black plank hung behind the shoulder (laid flat, its stock stood above the shoulder
 * and it cut into the back). The draw still fetches it from over the shoulder; the way GTA does
 * it, a weapon not in the hand is not shown.
 */
export const SHOW_SLUNG_SMG=false;
/** Metres per root unit for the body CARRY was measured on (citizen.json scaleToGame). */
const CARRY_UNITS=.96725;

/**
 * The weapons on one figure. `carry` lists what the body carries: the player has the pistol and
 * the katana; an officer (W3) has only the revolver, which appears in the hand when drawn and is
 * otherwise not shown. Null on a body without a right hand (the eleven-bone baked figure).
 */
export function createWeaponRig(root,{carry=['pistol','katana']}={}){
 const hand=root.getObjectByName('hand_r');
 if(!hand)return null;
 root.updateMatrixWorld(true);
 const handScale=new Vector3();hand.getWorldScale(handScale);
 const inHand={},stowed={},meshes=[];
 const make=(kind,parent)=>{
  const m=new Mesh(weaponGeometry(kind),weaponMaterial());
  m.name=`weapon-${kind}`;m.castShadow=true;m.frustumCulled=false;m.visible=false;
  parent.add(m);meshes.push(m);return m;
 };
 for(const kind of carry){
  const g=GRIP[kind],m=make(kind,hand);
  m.position.set(...g.at);m.quaternion.copy(basis(g.forward,g.up));
  // The hand bone carries the rig's scale (0.967 for the 1.76 m player); a weapon is the size
  // it is, not the size of the body.
  m.scale.setScalar(1/handScale.x);
  inHand[kind]=m;
 }
 // The root's frame WITHOUT its scale: CARRY is in metres at the game's body height.
 const rootFrame=new Matrix4().compose(root.getWorldPosition(new Vector3()),root.getWorldQuaternion(new Quaternion()),new Vector3(1,1,1));
 const place=(spot,kind)=>{
  const c=CARRY[spot],bone=root.getObjectByName(c.bone);if(!bone)return null;
  const m=make(kind??c.kind,bone);
  // Look 2c: CARRY is for the RUN 6.8 body. On a citizen (its own proportions) the spot moves by
  // as much as the carrying bone sits away from where that body's did (`carryRef`, root units).
  const at=new Vector3(...c.at),ref=root.userData?.carryRef?.[c.bone];
  if(ref){const here=root.worldToLocal(bone.getWorldPosition(new Vector3()));at.addScaledVector(here.sub(new Vector3(...ref)),CARRY_UNITS);}
  const inWorld=new Matrix4().multiplyMatrices(rootFrame,new Matrix4().compose(at,basis(c.forward,c.up),new Vector3(1,1,1)));
  new Matrix4().copy(bone.matrixWorld).invert().multiply(inWorld).decompose(m.position,m.quaternion,m.scale);
  return m;
 };
 if(carry.includes('pistol'))stowed.pistol=place('hip');
 if(carry.includes('katana')){stowed.katana=place('obi');stowed.saya=place('obi','saya');}
 if(carry.includes('smg'))stowed.smg=place('sling');
 // Stage 1: the magazine in the gun, and a second one on the sling (a slung gun has one too).
 const mag=inHand.smg?make('smgMag',inHand.smg):null;
 if(mag)mag.position.set(...SMG_MAG);
 if(stowed.smg){const m2=make('smgMag',stowed.smg);m2.position.set(...SMG_MAG);m2.visible=SHOW_SLUNG_SMG;}
 let current=null,magFree=false,magHidden=false;
 const inv=new Matrix4();
 const v=new Vector3(),q=new Quaternion();
 return {
  meshes,
  /** Which weapon is in the hand ('fists' or null for none); everything else is stowed. */
  show(weapon,{hidden=false}={}){
   current=weapon in inHand?weapon:null;
   for(const [k,m] of Object.entries(inHand))m.visible=!hidden&&k===current;
   if(stowed.pistol)stowed.pistol.visible=!hidden&&current!=='pistol';
   if(stowed.katana)stowed.katana.visible=!hidden&&current!=='katana';
   if(stowed.saya)stowed.saya.visible=!hidden&&current==='katana';
   if(stowed.smg)stowed.smg.visible=SHOW_SLUNG_SMG&&!hidden&&current!=='smg';
   if(mag){mag.visible=!hidden&&current==='smg'&&!magHidden;if(!magFree)mag.position.set(...SMG_MAG);}
  },
  /**
   * Stage 1: where the right hand goes to put `kind` away or take it out (its grip where it is
   * carried), in world space. False for what is not carried anywhere (the fists).
   */
  stowPoint(kind,out){const m=stowed[kind];if(!m)return false;m.updateWorldMatrix(true,false);out.setFromMatrixPosition(m.matrixWorld);return true;},
  /**
   * Katana A: a point along the stowed scabbard, `along` metres from the guard toward its end
   * (0.1 is the mouth, where the left hand holds it for a draw), in world space.
   */
  sayaPoint(along,out){const m=stowed.saya??stowed.katana;if(!m)return false;m.updateWorldMatrix(true,false);out.set(0,0,along).applyMatrix4(m.matrixWorld);return true;},
  /** Stage 1: a point in the drawn submachine gun's frame, in world space (for the reload's hand). */
  gunPoint(local,out){const m=current==='smg'?inHand.smg:null;if(!m)return false;m.updateWorldMatrix(true,false);out.set(local[0],local[1],local[2]).applyMatrix4(m.matrixWorld);return true;},
  /**
   * Stage 1: the magazine during a reload. `at` a world point to hold it at (the left hand), or
   * null for seated in the gun; `hidden` while it is dropped and the fresh one not yet in hand.
   */
  magazine(at,{hidden=false}={}){
   if(!mag)return false;
   magHidden=hidden;mag.visible=current==='smg'&&!hidden;
   if(at){inHand.smg.updateWorldMatrix(true,false);inv.copy(inHand.smg.matrixWorld).invert();mag.position.copy(at).applyMatrix4(inv);magFree=true;}
   else{mag.position.set(...SMG_MAG);magFree=false;}
   return true;
  },
  get current(){return current;},
  /** The drawn gun's muzzle and barrel direction, in world space. False when no gun is drawn. */
  muzzle(outPoint,outDirection){
   const m=current&&SHAPE[current]?.muzzle?inHand[current]:null;if(!m)return false;
   m.updateWorldMatrix(true,false);
   outPoint.set(...SHAPE[current].muzzle).applyMatrix4(m.matrixWorld);
   m.getWorldQuaternion(q);outDirection?.set(0,0,1).applyQuaternion(q);
   return true;
  },
  /** The drawn weapon's grip centre, in world space (R3). */
  grip(out){const m=current?inHand[current]:null;if(!m)return false;m.updateWorldMatrix(true,false);return out.setFromMatrixPosition(m.matrixWorld),true;},
  /** The katana tip, in world space, while it is drawn. */
  tip(out){const m=current==='katana'?inHand.katana:null;if(!m)return false;m.updateWorldMatrix(true,false);out.set(0,0,SHAPE.katana.tip).applyMatrix4(m.matrixWorld);return true;},
  dispose(){for(const m of meshes)m.removeFromParent();meshes.length=0;}
 };
}
