// What a character is, so that what a character looks like can change without the game
// noticing.
//
// Two things currently claim to be a playable human: the figure baked offline by
// scripts/bake-character.mjs, which is capsules on eleven bones, and the humanoid converted
// by scripts/convert-character.mjs, which is a real skinned body on sixty-five. They disagree
// about almost everything -- vertex count, bone names, how tall they are, how fast their walk
// cycle was drawn -- so the rest of the game is not told which one it has. It is handed a
// CharacterAsset:
//
//   {id, height, scale, gait, bones, instance(), dispose()}
//
// `instance()` returns {root, clips} ready to hand to an AnimationMixer, sharing geometry and
// skeleton bind data with every other instance from the same asset. `gait` maps a clip name
// to the ground speed it was authored at, which is the number a locomotion controller needs
// and the one a clip cannot state about itself.
//
// Replacing the body later means producing this shape. It does not mean editing the player
// controller, the camera, combat, or the crowd.
import {Color,MeshStandardMaterial,ObjectLoader} from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';

/** A citizen's five surfaces. Everything on the humanoid body is a mix of these. */
export const WARDROBE=Object.freeze({skin:0xdfb994,top:0xc94d38,bottom:0x263443,hair:0x241d19,shoe:0x191a1f});

const ROUGHNESS=Object.freeze({skin:.62,top:.86,bottom:.8,hair:.52,shoe:.44});

const UNIFORMS=`uniform vec3 uSkin;uniform vec3 uTop;uniform vec3 uBottom;uniform vec3 uHair;
uniform vec3 uShoe;uniform float uRough[5];
`;
// The converter writes a garment weight per vertex: red is skin, green the top, blue the
// trousers, alpha the hair, and whatever the four leave over is the shoe. The weights come
// from the skin weights themselves, so the mix is already soft wherever the skinning is.
const GARMENT=`
 float wShoe=max(0.,1.-vColor.r-vColor.g-vColor.b-vColor.a);
 diffuseColor.rgb=vColor.r*uSkin+vColor.g*uTop+vColor.b*uBottom+vColor.a*uHair+wShoe*uShoe;
`;
// Skin, cotton, denim, hair and a shoe do not scatter light alike, and one roughness makes all
// five look like the same plastic. The mix that picks the colour picks the roughness too.
const GARMENT_ROUGHNESS=`
 roughnessFactor=vColor.r*uRough[0]+vColor.g*uRough[1]+vColor.b*uRough[2]+vColor.a*uRough[3]
  +max(0.,1.-vColor.r-vColor.g-vColor.b-vColor.a)*uRough[4];
`;

/**
 * Dress one body.
 *
 * The colours are uniforms rather than baked vertex data so that one converted mesh can be
 * a whole street: a near-NPC pool hands each of its slots a different palette and pays for
 * one material each, not one mesh each.
 */
export function dressCitizen(root,palette={}){
 const colours={...WARDROBE,...palette};
 const materials=[];
 root.traverse(object=>{
  if(!object.isMesh)return;
  object.frustumCulled=false;
  if(!object.geometry.attributes.color)return;   // eyes and eyebrows stay flat
  const source=object.material;
  const material=new MeshStandardMaterial({name:source.name,color:0xffffff,metalness:0,
   roughness:ROUGHNESS.top,vertexColors:true});
  material.userData.palette={...colours};
  material.onBeforeCompile=shader=>{
   shader.uniforms.uSkin={value:new Color(colours.skin)};
   shader.uniforms.uTop={value:new Color(colours.top)};
   shader.uniforms.uBottom={value:new Color(colours.bottom)};
   shader.uniforms.uHair={value:new Color(colours.hair)};
   shader.uniforms.uShoe={value:new Color(colours.shoe)};
   shader.uniforms.uRough={value:[ROUGHNESS.skin,ROUGHNESS.top,ROUGHNESS.bottom,ROUGHNESS.hair,ROUGHNESS.shoe]};
   shader.fragmentShader=UNIFORMS+shader.fragmentShader
    // color_fragment has just multiplied the mask into diffuseColor; replace it outright.
    .replace('#include <color_fragment>','#include <color_fragment>'+GARMENT)
    .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>'+GARMENT_ROUGHNESS);
   material.userData.shader=shader;
  };
  // Every citizen compiles the same program; only the uniforms differ.
  material.customProgramCacheKey=()=>'citizen-garment';
  object.material=material;materials.push(material);
 });
 return {
  materials,
  /** Recolour in place, without recompiling: a pooled slot changes who it is between uses. */
  recolour(next){
   const merged={...colours,...next};
   for(const material of materials){
    material.userData.palette=merged;
    const shader=material.userData.shader;if(!shader)continue;
    shader.uniforms.uSkin.value.set(merged.skin);shader.uniforms.uTop.value.set(merged.top);
    shader.uniforms.uBottom.value.set(merged.bottom);shader.uniforms.uHair.value.set(merged.hair);
    shader.uniforms.uShoe.value.set(merged.shoe);
   }
  }
 };
}

/** Shared plumbing: the providers differ only in where their scene, clips and clothes come from. */
function asset({id,template,clips,gait,height,scale,dress,bones}){
 let disposed=false;
 return {
  id,height,scale,gait:Object.freeze({...gait}),bones,
  get template(){return template;},
  instance(palette){
   if(disposed)throw new Error(`character asset ${id} is disposed`);
   const root=clone(template);
   root.scale.setScalar(scale);
   const worn=dress(root,palette);
   return {root,clips,
    recolour:worn.recolour,
    /** Wear a different height without losing the asset's own units-to-metres factor. */
    setHeight(metres){root.scale.setScalar(scale*metres/height);},
    dispose(){worn.dispose();root.removeFromParent();root.clear();}};
  },
  dispose(){
   if(disposed)return;disposed=true;
   const geometries=new Set(),materials=new Set(),skeletons=new Set();
   template.traverse(o=>{
    if(o.isMesh){geometries.add(o.geometry);for(const m of [].concat(o.material))materials.add(m);}
    if(o.isSkinnedMesh)skeletons.add(o.skeleton);});
   geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());skeletons.forEach(s=>s.dispose());
  }
 };
}

/**
 * The offline-baked original: eleven bones, twelve clips, no network, no waiting.
 *
 * This is what the first frame gets, every time. It costs nothing to construct because its
 * buffers were authored at build time, and it is the fallback if the humanoid never arrives.
 */
export function bakedCitizen(pack){
 const template=new ObjectLoader().parse(pack.scene);
 // One material per colour in the baked figure, and only the shirt varies. Cloning it per
 // instance is what the near-NPC pool has always done to tell one pedestrian from another.
 const dress=(root,palette)=>{
  const shirt=root.getObjectByName('HeroMaterial0');
  if(!shirt)return {recolour(){},dispose(){}};
  const material=shirt.material.clone();shirt.material=material;
  const apply=next=>{if(next?.top!==undefined)material.color.setHex(next.top);};
  apply(palette);
  return {recolour:apply,dispose(){material.dispose();}};
 };
 return asset({id:'baked',template,clips:template.animations,gait:pack.gait,
  height:1.76,scale:1,dress,bones:{head:'Head'}});
}

/**
 * The converted humanoid. `report` is public/data/character/citizen.json, written by the
 * converter, which is where the measured gait and the height-to-scale factor live -- neither
 * is recoverable from the GLB itself.
 */
export function humanoidCitizen(gltf,report,base=WARDROBE){
 const template=gltf.scene;
 const dress=(root,palette)=>{
  const worn=dressCitizen(root,{...base,...palette});
  return {recolour:worn.recolour,dispose(){worn.materials.forEach(m=>m.dispose());}};
 };
 return asset({id:'humanoid',template,clips:gltf.animations,gait:report.gait,
  height:report.body.height*report.body.scaleToGame,scale:report.body.scaleToGame,
  dress,bones:{head:'Head'}});
}
