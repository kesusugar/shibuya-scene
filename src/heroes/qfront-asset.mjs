// Cityscape C2: QFRONT's built detail from Blender (scripts/blender/build-qfront.py) -- crown
// louvres, corner fins, slab ledges, the podium canopy and its downlight, and the lettering.
// Loaded after the hero landmarks are up; the procedural QFRONT stands on its own if it never
// arrives. Four meshes, one per material; the ambient occlusion is in the vertex colour.
import {MeshStandardMaterial,Color} from 'three';
export const QFRONT_ASSET_URL='/data/heroes/qfront.glb';
const LOOK=Object.freeze({
 qf_frame:{name:'qfront-asset-frame',color:0x2b3136,roughness:.32,metalness:.85},
 qf_louvre:{name:'qfront-asset-crown',color:0xc9cdcf,roughness:.38,metalness:.55},
 qf_logo:{name:'qfront-asset-logo',color:0xf4f4f2,roughness:.3,metalness:0,emissive:0xffffff,emissiveIntensity:.08},
 qf_light:{name:'qfront-asset-light',color:0xfff0d8,roughness:.5,metalness:0,emissive:0xffd9a8,emissiveIntensity:.1}
});
/** Dress a loaded glTF scene: the scene's own materials, names the day/night system knows. */
export function dressQfrontAsset(scene){
 const materials=[];let triangles=0,meshes=0;
 scene.name='qfront-asset';
 scene.traverse(o=>{if(!o.isMesh)return;const look=LOOK[o.material?.name];if(!look)return;
  const m=new MeshStandardMaterial({color:new Color(look.color),roughness:look.roughness,metalness:look.metalness,envMapIntensity:1,vertexColors:!!o.geometry.attributes.color,
   ...(look.emissive?{emissive:new Color(look.emissive),emissiveIntensity:look.emissiveIntensity}:{})});
  o.material.dispose();o.material=m;o.name=look.name;materials.push(m);o.castShadow=look.name!=='qfront-asset-light';o.receiveShadow=true;
  triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;meshes++;});
 return {root:scene,meshes,triangles,dispose(){scene.removeFromParent();scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});}};
}
/** Load and dress the asset. Resolves to null (and logs) on any failure: the scene keeps going. */
export async function loadQfrontAsset(url=QFRONT_ASSET_URL){
 try{
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const gltf=await new GLTFLoader().loadAsync(url);
  return dressQfrontAsset(gltf.scene);
 }catch(e){console.warn('[QFRONT asset] not loaded; the procedural QFRONT stays',e);return null;}
}
