/**
 * Look 2c (docs/GTA-LOOK.md): the everyday idles and walks of the citizens, from the 100STYLE
 * motion capture dataset (CC BY 4.0), retargeted onto the crowd skeleton by
 * scripts/mocap/style-clips.mjs into public/data/character/citizen-moves.json.
 *
 * Names are `<base>.<style>`: `Idle.phone`, `Idle.folded`, `Walk.elder`, `Walk.rushed`... A citizen
 * plays one of them where the crowd would play `Idle` or `Walk` (see `appearanceOf` and
 * `styledClip`). `clip.userData.stride` is the ground one walk cycle covers, for the cadence.
 */
import {AnimationClip,QuaternionKeyframeTrack,VectorKeyframeTrack} from 'three';

const f32=(b64,decode)=>{const u=decode(b64);return new Float32Array(u.buffer,u.byteOffset,u.byteLength/4);};
/** AnimationClips from citizen-moves.json. `decode(base64)` gives bytes (atob in the page, Buffer in Node). */
export function movesClips(json,decode){
 return (json?.clips??[]).map(c=>{
  const times=f32(c.times,decode),tracks=Object.entries(c.tracks).map(([bone,v])=>new QuaternionKeyframeTrack(`${bone}.quaternion`,times,f32(v,decode)));
  tracks.push(new VectorKeyframeTrack('pelvis.position',times,f32(c.pelvis,decode)));
  const clip=new AnimationClip(c.name,c.duration,tracks);clip.userData={stride:c.stride,kind:c.kind,source:c.source};
  return clip;
 });
}
export const decodeBase64=b=>typeof Buffer!=='undefined'?Buffer.from(b,'base64'):Uint8Array.from(atob(b),c=>c.charCodeAt(0));

/** The hurry threshold: above this a walker with a rushed walk uses it, m/s. */
export const HURRY=1.55;
/** The clip a citizen plays for a base clip name, given their styles and pace. */
export function styledClip(name,{idle=null,walk=null,hurry=null}={},pace=0){
 if(name==='Idle'&&idle)return idle;
 if(name==='Walk'){if(hurry&&pace>HURRY)return hurry;if(walk)return walk;}
 return name;
}
