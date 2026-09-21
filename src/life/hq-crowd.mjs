/**
 * A crowd of high-fidelity people that costs almost nothing per person.
 *
 * RUN 7A. The requirement is not "a few good bodies near the camera and cardboard behind" --
 * it is a scramble crossing full of people who can all SEE a car and all react to it. So
 * visual quality and per-character runtime cost are separated completely:
 *
 *   - Quality comes from the RUN 6.8 geometry, decimated offline, drawn with real skinning.
 *   - Animation comes from a bone matrix atlas baked offline and sampled in the vertex
 *     shader. There is NO Skeleton and NO AnimationMixer per citizen, at any count.
 *   - Time advances on the GPU. A citizen's phase and clip live in instanced attributes, so
 *     a walking crowd costs the CPU nothing at all between state changes.
 *   - State lives in typed arrays, not objects. One citizen is a few numbers at an index.
 *
 * What the CPU does per frame is write a transform for the citizens that moved. What it does
 * on a state change -- a car arrives, someone is hit -- is write one integer.
 *
 * The draw call count is the archetype count, not the population: four instanced meshes carry
 * two thousand people.
 */
import {InstancedMesh,InstancedBufferAttribute,BufferGeometry,BufferAttribute,
        MeshStandardMaterial,DataTexture,RGBAFormat,FloatType,NearestFilter,
        Object3D,Group,DynamicDrawUsage} from 'three';

/** The states a citizen can be in. Index into CLIP_FOR, and what the CPU writes. */
export const STATE=Object.freeze({
 NORMAL:0,LOOK:1,AVOID:2,FLEE:3,HIT:4,KNOCKDOWN:5,DOWNED:6,RECOVER:7
});
/** Which baked clip each state plays. Several states share one clip on purpose. */
export const CLIP_FOR=Object.freeze({
 [STATE.NORMAL]:'Walk',[STATE.LOOK]:'Walk',[STATE.AVOID]:'Run',[STATE.FLEE]:'Run',
 [STATE.HIT]:'Startle',[STATE.KNOCKDOWN]:'Fall',[STATE.DOWNED]:'Fall',[STATE.RECOVER]:'Guard'
});
/** How long a state lasts before it can give way, in seconds. 0 means "until told". */
export const STATE_HOLD=Object.freeze({
 [STATE.NORMAL]:0,[STATE.LOOK]:.5,[STATE.AVOID]:.9,[STATE.FLEE]:1.5,
 [STATE.HIT]:.45,[STATE.KNOCKDOWN]:1.4,[STATE.DOWNED]:2.5,[STATE.RECOVER]:1.2
});

const PACK=c=>((c>>16)&255)*65536+((c>>8)&255)*256+(c&255);

/**
 * Standard skinning, with the bone matrices read from a texture instead of a Skeleton.
 *
 * three's own skinning uniform-block holds one skeleton; a crowd needs two hundred different
 * poses in the same draw call, so the matrices move into a texture indexed by (frame, bone)
 * and every instance picks its own row. That is the whole trick, and it is why nothing here
 * needs a Skeleton object.
 */
function installCrowdSkinning(material,atlas,size,{interpolate=true}={}){
 material.defines={...material.defines,HQ_CROWD:'1',...(interpolate?{HQ_LERP:'1'}:{})};
 material.onBeforeCompile=shader=>{
  shader.uniforms.boneAtlas={value:atlas};
  shader.uniforms.boneAtlasSize={value:size};
  shader.uniforms.crowdTime={value:0};
  material.userData.shader=shader;
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute vec4 skinIndex;
attribute vec4 skinWeight;
attribute vec2 aClip;     // x: first row of this clip in the atlas, y: how many rows
attribute vec2 aAnim;     // x: phase 0..1, y: playback rate (0 freezes on the phase)
attribute vec4 aPal;      // skin, top, bottom, hair -- each RGB packed into one float
attribute float aShoe;
uniform sampler2D boneAtlas;
uniform vec2 boneAtlasSize;
uniform float crowdTime;
varying vec4 vPal;
varying float vShoe;

vec3 unpackRGB(float v){
 float r=floor(v/65536.0);
 float g=floor(mod(v,65536.0)/256.0);
 float b=mod(v,256.0);
 vec3 c=vec3(r,g,b)/255.0;
 // sRGB -> linear-sRGB, the SAME conversion THREE.Color applies when ColorManagement is on.
 //
 // This is the RUN 7C root cause. The palette is packed as an 8-bit sRGB hex, and the
 // renderer's working space is linear, so handing it straight to diffuseColor made every
 // colour too bright -- and NOT uniformly: measured against new THREE.Color(hex), a dark
 // navy #1c2028 came out 9.5x too bright, a mid grey 2.9x, and a cream top only 1.1x. Dark
 // clothing stopped reading as dark while light clothing looked nearly right, which is
 // exactly what a washed-out crowd is. The RUN 6.8 near characters were correct all along
 // because they pass their palette through THREE.Color, which does this for them.
 //
 // The conversion is done here rather than at pack time on purpose: a linear value for a
 // dark colour is about 0.012, and eight bits of that is three levels, which would band.
 // Eight bits of sRGB expanded here is what an sRGB texture does, and it has the precision
 // where the eye needs it.
 return mix(pow(c*0.9478672986+0.0521327014,vec3(2.4)),c*0.0773993808,step(c,vec3(0.04045)));
}
mat4 readBone(float row,float bone){
 vec2 inv=1.0/boneAtlasSize;
 float x0=bone*3.0;
 float y=(row+0.5)*inv.y;
 vec4 a=texture2D(boneAtlas,vec2((x0+0.5)*inv.x,y));
 vec4 b=texture2D(boneAtlas,vec2((x0+1.5)*inv.x,y));
 vec4 c=texture2D(boneAtlas,vec2((x0+2.5)*inv.x,y));
 return mat4(a.x,b.x,c.x,0.0,
             a.y,b.y,c.y,0.0,
             a.z,b.z,c.z,0.0,
             a.w,b.w,c.w,1.0);
}
mat4 crowdSkinMatrix(){
 float frames=max(1.0,aClip.y);
 float t=fract(aAnim.x+crowdTime*aAnim.y);
 float f=t*frames;
 float f0=floor(f);
 float r0=aClip.x+mod(f0,frames);
 mat4 m=
  readBone(r0,skinIndex.x)*skinWeight.x+
  readBone(r0,skinIndex.y)*skinWeight.y+
  readBone(r0,skinIndex.z)*skinWeight.z+
  readBone(r0,skinIndex.w)*skinWeight.w;
#ifdef HQ_LERP
 // Blend to the next baked row. Linear on matrices is not a rotation blend, but over one
 // frame of a 15-30 fps bake the error is far below what a crowd at four metres resolves,
 // and it costs half of what quaternion interpolation would.
 float r1=aClip.x+mod(f0+1.0,frames);
 mat4 n=
  readBone(r1,skinIndex.x)*skinWeight.x+
  readBone(r1,skinIndex.y)*skinWeight.y+
  readBone(r1,skinIndex.z)*skinWeight.z+
  readBone(r1,skinIndex.w)*skinWeight.w;
 m=m*(1.0-(f-f0))+n*(f-f0);
#endif
 return m;
}`);
  shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',
`#include <beginnormal_vertex>
 mat4 crowdBone=crowdSkinMatrix();
 objectNormal=mat3(crowdBone)*objectNormal;
 vPal=aPal;vShoe=aShoe;`);
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
`#include <begin_vertex>
 transformed=(crowdBone*vec4(transformed,1.0)).xyz;`);

  // The garment mask, exactly as RUN 6.8's near characters use it: four vertex-colour
  // channels choose between five surfaces, the shoe being whatever the four leave over.
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec4 vPal;
varying float vShoe;
vec3 unpackRGB(float v){
 float r=floor(v/65536.0);
 float g=floor(mod(v,65536.0)/256.0);
 float b=mod(v,256.0);
 vec3 c=vec3(r,g,b)/255.0;
 // sRGB -> linear-sRGB, the SAME conversion THREE.Color applies when ColorManagement is on.
 //
 // This is the RUN 7C root cause. The palette is packed as an 8-bit sRGB hex, and the
 // renderer's working space is linear, so handing it straight to diffuseColor made every
 // colour too bright -- and NOT uniformly: measured against new THREE.Color(hex), a dark
 // navy #1c2028 came out 9.5x too bright, a mid grey 2.9x, and a cream top only 1.1x. Dark
 // clothing stopped reading as dark while light clothing looked nearly right, which is
 // exactly what a washed-out crowd is. The RUN 6.8 near characters were correct all along
 // because they pass their palette through THREE.Color, which does this for them.
 //
 // The conversion is done here rather than at pack time on purpose: a linear value for a
 // dark colour is about 0.012, and eight bits of that is three levels, which would band.
 // Eight bits of sRGB expanded here is what an sRGB texture does, and it has the precision
 // where the eye needs it.
 return mix(pow(c*0.9478672986+0.0521327014,vec3(2.4)),c*0.0773993808,step(c,vec3(0.04045)));
}`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
 float wShoe=max(0.0,1.0-vColor.r-vColor.g-vColor.b-vColor.a);
 diffuseColor.rgb=vColor.r*unpackRGB(vPal.x)+vColor.g*unpackRGB(vPal.y)
  +vColor.b*unpackRGB(vPal.z)+vColor.a*unpackRGB(vPal.w)+wShoe*unpackRGB(vShoe);`);
  // The same per-garment roughness the near characters use (RUN 6.8). Without it every
  // surface is one number and skin, cotton, denim, hair and a shoe all read as the same
  // plastic -- which under the scene's tone mapping came out as a washed-out white crowd,
  // visibly different from the RUN 6.8 bodies standing next to them.
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',
`#include <roughnessmap_fragment>
 roughnessFactor=vColor.r*0.62+vColor.g*0.86+vColor.b*0.80+vColor.a*0.52+wShoe*0.44;`);
 };
 material.customProgramCacheKey=()=>'hq-crowd-'+(interpolate?'lerp':'snap');
}

function geometryFrom(level,bin){
 const g=new BufferGeometry();
 const slice=(e,Ctor,size,normalized=false)=>new BufferAttribute(
  new Ctor(bin,e.byteOffset,e.count),size,normalized);
 g.setAttribute('position',slice(level.position,Float32Array,3));
 g.setAttribute('normal',slice(level.normal,Float32Array,3));
 g.setAttribute('skinIndex',slice(level.skinIndex,Uint8Array,4));
 g.setAttribute('skinWeight',slice(level.skinWeight,Uint8Array,4,true));
 g.setAttribute('color',slice(level.color,Uint8Array,4,true));
 g.setIndex(slice(level.index,level.indexType==='u32'?Uint32Array:Uint16Array,1));
 g.computeBoundingSphere();
 return g;
}

/**
 * Build the crowd.
 *
 * @param manifest public/data/crowd/hq-crowd.json
 * @param bin      its .bin, as an ArrayBuffer
 * @param capacity how many citizens each archetype may hold
 */
export function createHQCrowd(manifest,bin,{capacity=512,lod='L1',lods=null,interpolate=true}={}){
 // RUN 7B: a lane per (archetype, LOD). A citizen moves between LODs by changing lane, which
 // is a slot swap -- geometry, palette and phase all come with them, so nothing about who
 // they are depends on how far away they happen to be.
 const levels=lods??[lod];
 const root=new Group();root.name='hq-crowd';
 const atlasData=new Float32Array(bin,manifest.atlas.byteOffset,manifest.atlas.count);
 const atlas=new DataTexture(atlasData,manifest.atlas.width,manifest.atlas.height,
  RGBAFormat,FloatType);
 atlas.minFilter=atlas.magFilter=NearestFilter;
 atlas.generateMipmaps=false;atlas.needsUpdate=true;
 const atlasSize={x:manifest.atlas.width,y:manifest.atlas.height};

 const clips=new Map(manifest.clips.map(c=>[c.name,c]));
 const lanes=[];                       // one per archetype
 const scratch=new Object3D();

 for(const archetype of manifest.archetypes)for(const wanted of levels){
  const level=archetype.levels.find(l=>l.name===wanted)??archetype.levels[0];
  const geometry=geometryFrom(level,bin);
  const material=new MeshStandardMaterial({vertexColors:true,roughness:.82,metalness:0});
  installCrowdSkinning(material,atlas,atlasSize,{interpolate});
  const mesh=new InstancedMesh(geometry,material,capacity);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled=false;mesh.count=0;
  mesh.name=`hq-crowd-${archetype.id}-${level.name}`;

  const clipAttr=new InstancedBufferAttribute(new Float32Array(capacity*2),2).setUsage(DynamicDrawUsage);
  const animAttr=new InstancedBufferAttribute(new Float32Array(capacity*2),2).setUsage(DynamicDrawUsage);
  const palAttr=new InstancedBufferAttribute(new Float32Array(capacity*4),4).setUsage(DynamicDrawUsage);
  const shoeAttr=new InstancedBufferAttribute(new Float32Array(capacity),1).setUsage(DynamicDrawUsage);
  geometry.setAttribute('aClip',clipAttr);
  geometry.setAttribute('aAnim',animAttr);
  geometry.setAttribute('aPal',palAttr);
  geometry.setAttribute('aShoe',shoeAttr);

  root.add(mesh);
  lanes.push({archetype,mesh,geometry,material,level,lod:level.name,
   clipAttr,animAttr,palAttr,shoeAttr,count:0,
   // slot -> citizen index, so a slot can be vacated by swapping the last one into it.
   owners:new Int32Array(capacity).fill(-1),
   triangles:level.triangles,vertices:level.vertices});
 }

 // ---- per-citizen state, as typed arrays -------------------------------------------
 //
 // No objects. A citizen is an index, and everything about them is a lane in a flat array,
 // so two thousand of them are a handful of allocations made once.
 const max=capacity*lanes.length;
 const state={
  id:new Int32Array(max),           // pedestrian id, for identity across everything
  lane:new Uint8Array(max),         // which archetype, and therefore which mesh
  slot:new Int32Array(max),         // index within that mesh
  x:new Float32Array(max),y:new Float32Array(max),z:new Float32Array(max),
  heading:new Float32Array(max),speed:new Float32Array(max),
  height:new Float32Array(max),width:new Float32Array(max),
  phase:new Float32Array(max),rate:new Float32Array(max),
  behaviour:new Uint8Array(max),    // STATE
  timer:new Float32Array(max),
  impulseX:new Float32Array(max),impulseZ:new Float32Array(max),impulseY:new Float32Array(max),
  fallen:new Float32Array(max),     // 0..1 how far into the ground pose
  health:new Uint8Array(max)
 };
 // The palette also lives here, not only in the instanced attribute, because moving a citizen
 // between LOD lanes has to rewrite it into the new lane and an attribute is write-mostly.
 const palette=new Float32Array(max*4),shoe=new Float32Array(max);
 let population=0;
 const byId=new Map();

 const stats={population:0,drawCalls:0,triangles:0,vertices:0,
  stateChanges:0,transformWrites:0,lanes:lanes.length,lod,
  byState:new Uint32Array(8),byArchetype:new Uint32Array(lanes.length)};

 const clipOf=name=>clips.get(name)??clips.values().next().value;

 function writeClip(i){
  const lane=lanes[state.lane[i]],slot=state.slot[i];
  const clip=clipOf(CLIP_FOR[state.behaviour[i]]);
  lane.clipAttr.setXY(slot,clip.row,clip.frames);
  // A clip's playback rate is its own duration, scaled by how fast this citizen moves, so a
  // walk cycle matches the ground rather than sliding. Frozen states hold a single pose.
  const behaviour=state.behaviour[i];
  const frozen=behaviour===STATE.DOWNED;
  const rate=frozen?0:state.rate[i]/Math.max(.01,clip.duration);
  lane.animAttr.setXY(slot,state.phase[i],rate);
  lane.clipAttr.needsUpdate=true;lane.animAttr.needsUpdate=true;
 }

 return {
  root,state,stats,lanes,
  get population(){return population;},
  clips:manifest.clips,
  archetypes:manifest.archetypes,

  /** Put a citizen in the crowd. `look` is an appearance from src/life/appearance.mjs. */
  spawn(id,look,laneIndex,{x=0,y=0,z=0,heading=0,speed=0}={}){
   if(byId.has(id))return byId.get(id);
   const lane=lanes[laneIndex];
   if(!lane||lane.count>=lane.mesh.instanceMatrix.count)return -1;
   const i=population++;
   const slot=lane.count++;
   state.id[i]=id;state.lane[i]=laneIndex;state.slot[i]=slot;lane.owners[slot]=i;
   state.x[i]=x;state.y[i]=y;state.z[i]=z;
   state.heading[i]=heading;state.speed[i]=speed;
   state.height[i]=look.height;state.width[i]=look.width;
   // Phase and rate come from the pedestrian id, never from a random number and never from
   // the frame: the same person always walks on the same foot, and a row of citizens is not
   // a chorus line.
   const h=Math.abs(Math.imul(id|0,0x9e3779b1))>>>0;
   state.phase[i]=((h>>>8)&1023)/1023;
   state.rate[i]=.88+((h>>>18)&255)/255*.24;
   state.behaviour[i]=STATE.NORMAL;state.timer[i]=0;
   state.health[i]=100;state.fallen[i]=0;
   state.impulseX[i]=state.impulseZ[i]=state.impulseY[i]=0;
   palette[i*4]=PACK(look.skin);palette[i*4+1]=PACK(look.top);
   palette[i*4+2]=PACK(look.bottom);palette[i*4+3]=PACK(look.hairColour);
   shoe[i]=PACK(look.shoe);
   lane.palAttr.setXYZW(slot,palette[i*4],palette[i*4+1],palette[i*4+2],palette[i*4+3]);
   lane.shoeAttr.setX(slot,shoe[i]);
   lane.palAttr.needsUpdate=true;lane.shoeAttr.needsUpdate=true;
   writeClip(i);
   byId.set(id,i);
   return i;
  },

  indexOf(id){return byId.has(id)?byId.get(id):-1;},

  /**
   * Take a citizen out of the crowd.
   *
   * Two swap-removes: one in the lane, so `mesh.count` stays the number actually drawn, and
   * one in the state arrays, so `population` stays the number actually held. Without this a
   * layer that keeps re-choosing who to draw only ever grows: instances drop out of the
   * budget, stop being positioned, and are still rendered -- frozen bodies standing in the
   * street next to the legacy pedestrian they were supposed to replace.
   */
  release(id){
   const i=byId.get(id);
   if(i===undefined)return false;
   const lane=lanes[state.lane[i]],slot=state.slot[i],lastSlot=lane.count-1;
   if(slot!==lastSlot){
    const moved=lane.owners[lastSlot];
    lane.palAttr.setXYZW(slot,lane.palAttr.getX(lastSlot),lane.palAttr.getY(lastSlot),
     lane.palAttr.getZ(lastSlot),lane.palAttr.getW(lastSlot));
    lane.shoeAttr.setX(slot,lane.shoeAttr.getX(lastSlot));
    lane.clipAttr.setXY(slot,lane.clipAttr.getX(lastSlot),lane.clipAttr.getY(lastSlot));
    lane.animAttr.setXY(slot,lane.animAttr.getX(lastSlot),lane.animAttr.getY(lastSlot));
    lane.owners[slot]=moved;
    if(moved>=0)state.slot[moved]=slot;
    lane.palAttr.needsUpdate=lane.shoeAttr.needsUpdate=true;
    lane.clipAttr.needsUpdate=lane.animAttr.needsUpdate=true;
   }
   lane.owners[lastSlot]=-1;lane.count--;
   byId.delete(id);
   const last=population-1;
   if(i!==last){
    for(const key of Object.keys(state))state[key][i]=state[key][last];
    for(let k=0;k<4;k++)palette[i*4+k]=palette[last*4+k];
    shoe[i]=shoe[last];
    byId.set(state.id[i],i);
    lanes[state.lane[i]].owners[state.slot[i]]=i;
   }
   population--;
   return true;
  },

  /** Which lane holds a given archetype at a given LOD, or -1. */
  laneFor(archetypeId,lodName){
   return lanes.findIndex(l=>l.archetype.id===archetypeId&&l.lod===lodName);
  },

  /**
   * Move a citizen to another lane -- in practice, another level of detail.
   *
   * Swap-remove from the old lane: the last instance is moved into the vacated slot and its
   * owner is told where it went, so the lane stays densely packed and `mesh.count` remains
   * the number actually drawn. Everything that makes a citizen who they are -- palette,
   * phase, clip, height, build -- is rewritten into the new lane from their own state, so an
   * LOD change cannot alter their appearance or restart their walk cycle.
   */
  moveLane(i,laneIndex){
   if(i<0||i>=population)return false;
   const from=lanes[state.lane[i]],to=lanes[laneIndex];
   if(!to||from===to)return false;
   if(to.count>=to.mesh.instanceMatrix.count)return false;
   const slot=state.slot[i],last=from.count-1;
   if(slot!==last){
    const moved=from.owners[last];
    // Carry the last instance's attributes into the hole it is filling.
    from.palAttr.setXYZW(slot,from.palAttr.getX(last),from.palAttr.getY(last),
     from.palAttr.getZ(last),from.palAttr.getW(last));
    from.shoeAttr.setX(slot,from.shoeAttr.getX(last));
    from.clipAttr.setXY(slot,from.clipAttr.getX(last),from.clipAttr.getY(last));
    from.animAttr.setXY(slot,from.animAttr.getX(last),from.animAttr.getY(last));
    from.owners[slot]=moved;
    if(moved>=0)state.slot[moved]=slot;
    from.palAttr.needsUpdate=from.shoeAttr.needsUpdate=true;
    from.clipAttr.needsUpdate=from.animAttr.needsUpdate=true;
   }
   from.owners[last]=-1;from.count--;
   const target=to.count++;
   state.lane[i]=laneIndex;state.slot[i]=target;to.owners[target]=i;
   to.palAttr.setXYZW(target,palette[i*4],palette[i*4+1],palette[i*4+2],palette[i*4+3]);
   to.shoeAttr.setX(target,shoe[i]);
   to.palAttr.needsUpdate=to.shoeAttr.needsUpdate=true;
   writeClip(i);
   return true;
  },

  /** Move a citizen. Cheap enough to call for everyone, every frame. */
  place(i,x,y,z,heading,speed){
   state.x[i]=x;state.y[i]=y;state.z[i]=z;
   state.heading[i]=heading;
   if(speed!==undefined&&speed!==state.speed[i]){state.speed[i]=speed;}
  },

  /**
   * Change what a citizen is doing.
   *
   * This is the ONLY per-citizen CPU work a reaction costs: one integer, one timer, and four
   * floats of instanced attribute. It is what makes "thirty people react at once" cost the
   * same as thirty writes rather than thirty skeletons.
   */
  setState(i,behaviour,{impulseX=0,impulseZ=0,impulseY=0,force=false}={}){
   if(i<0||i>=population)return false;
   if(!force&&state.timer[i]>0&&behaviour<state.behaviour[i])return false;
   if(state.behaviour[i]===behaviour&&!force)return false;
   state.behaviour[i]=behaviour;
   state.timer[i]=STATE_HOLD[behaviour]??0;
   if(behaviour===STATE.KNOCKDOWN||behaviour===STATE.HIT){
    state.impulseX[i]=impulseX;state.impulseZ[i]=impulseZ;state.impulseY[i]=impulseY;
   }
   if(behaviour===STATE.NORMAL)state.fallen[i]=0;
   writeClip(i);
   stats.stateChanges++;
   return true;
  },

  /**
   * Advance timers, carry anyone who is falling, and write the transforms.
   *
   * Animation is NOT advanced here -- the GPU does that from the phase and the clock. What
   * this loop does is arithmetic on flat arrays, which is why its cost per citizen is a few
   * nanoseconds rather than a mixer update.
   */
  update(dt,{time=0}={}){
   const start=(typeof performance!=='undefined'?performance.now():0);
   stats.byState.fill(0);stats.byArchetype.fill(0);
   let writes=0;
   for(const lane of lanes){
    const shader=lane.material.userData.shader;
    if(shader)shader.uniforms.crowdTime.value=time;
   }
   for(let i=0;i<population;i++){
    const behaviour=state.behaviour[i];
    if(state.timer[i]>0){
     state.timer[i]-=dt;
     if(state.timer[i]<=0){
      // Knockdown settles into downed; downed waits to be recovered; everything else calms.
      // HIT -> KNOCKDOWN -> DOWNED -> RECOVER -> NORMAL. The chain must CLOSE.
      //
      // It did not: DOWNED was excluded from the fall-through on the theory that it "waits to
      // be recovered", and nothing ever recovered it. Over 240 simulated seconds that left
      // 132 bodies permanently DOWNED and permanently disowned from their own routes --
      // stale state that only grows, which is precisely what a long-running crossing must not
      // accumulate. A body now gets up.
      const next=behaviour===STATE.HIT?STATE.KNOCKDOWN
       :behaviour===STATE.KNOCKDOWN?STATE.DOWNED
       :behaviour===STATE.DOWNED?STATE.RECOVER
       :STATE.NORMAL;
      state.behaviour[i]=next;
      state.timer[i]=STATE_HOLD[next]??0;
      if(next===STATE.NORMAL)state.fallen[i]=0;
      writeClip(i);
     }
    }
    // A body that has been hit carries its own impulse and slides to a halt. No rigid body,
    // no ragdoll: an impulse, a drag, and a ground clamp, which is all a crowd needs to show
    // that a car went through it.
    if(state.impulseX[i]!==0||state.impulseZ[i]!==0||state.impulseY[i]!==0){
     state.x[i]+=state.impulseX[i]*dt;
     state.z[i]+=state.impulseZ[i]*dt;
     state.y[i]+=state.impulseY[i]*dt;
     state.impulseY[i]-=9.81*dt;
     if(state.y[i]<=0){state.y[i]=0;state.impulseY[i]=0;
      const drag=Math.max(0,1-6*dt);
      state.impulseX[i]*=drag;state.impulseZ[i]*=drag;
      if(Math.hypot(state.impulseX[i],state.impulseZ[i])<.05){state.impulseX[i]=0;state.impulseZ[i]=0;}
     }
     state.fallen[i]=Math.min(1,state.fallen[i]+dt*2.5);
    }
    stats.byState[behaviour]++;
    stats.byArchetype[state.lane[i]]++;

    const lane=lanes[state.lane[i]];
    const archetype=lane.archetype;
    const k=archetype.scaleToGame*state.height[i]/archetype.naturalHeight;
    scratch.position.set(state.x[i],state.y[i],state.z[i]);
    scratch.rotation.set(0,state.heading[i],0);
    scratch.scale.set(k*state.width[i],k,k*state.width[i]);
    scratch.updateMatrix();
    lane.mesh.setMatrixAt(state.slot[i],scratch.matrix);
    writes++;
   }
   let triangles=0,vertices=0,draws=0;
   for(const lane of lanes){
    lane.mesh.count=lane.count;
    lane.mesh.instanceMatrix.needsUpdate=true;
    if(lane.count){draws++;triangles+=lane.count*lane.triangles;vertices+=lane.count*lane.vertices;}
   }
   stats.population=population;stats.drawCalls=draws;
   stats.triangles=triangles;stats.vertices=vertices;stats.transformWrites=writes;
   stats.updateMs=(typeof performance!=='undefined'?performance.now():0)-start;
   return stats;
  },

  inspect(){
   const byLod={};for(const l of lanes)byLod[l.lod]=(byLod[l.lod]??0)+l.count;
   return {population,lod,lods:levels,byLod,drawCalls:stats.drawCalls,triangles:stats.triangles,
    vertices:stats.vertices,updateMs:Number((stats.updateMs??0).toFixed(3)),
    stateChanges:stats.stateChanges,
    skeletons:0,mixers:0,
    byState:Object.fromEntries(Object.entries(STATE).map(([k,v])=>[k,stats.byState[v]])),
    byArchetype:Object.fromEntries(lanes.map((l,i)=>[l.archetype.name,stats.byArchetype[i]]))};
  },

  dispose(){
   for(const lane of lanes){lane.geometry.dispose();lane.material.dispose();
    lane.mesh.dispose?.();lane.mesh.removeFromParent();}
   atlas.dispose();root.removeFromParent();root.clear();
   population=0;byId.clear();
  }
 };
}
