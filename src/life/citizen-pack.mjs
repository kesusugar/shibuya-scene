/**
 * Look 2 (docs/GTA-LOOK.md): fetching the MakeHuman CC0 citizens for the crowd.
 *
 * public/data/crowd/citizens.json + .bin have the layout of hq-crowd.json/.bin (same bone atlas,
 * same clips), with a texture atlas per archetype in public/data/crowd/citizens/. Built by
 * scripts/blender/build-citizens.py and npm run bake:citizens.
 */
import {TextureLoader,SRGBColorSpace,LinearMipmapLinearFilter,LinearFilter} from 'three';

/** [manifest, bin] of the citizens pack, from the site's base URL. Rejects when it is missing. */
export function loadCitizenPack(base='/'){
 return Promise.all([
  fetch(`${base}data/crowd/citizens.json`).then(r=>{if(!r.ok)throw new Error(`citizens manifest ${r.status}`);return r.json();}),
  fetch(`${base}data/crowd/citizens.bin`).then(r=>{if(!r.ok)throw new Error(`citizens pack ${r.status}`);return r.arrayBuffer();})]);
}

/**
 * `texture(archetype)` for createHQCrowd: each archetype's atlas, loaded once. glTF UVs, so no
 * flip; sRGB, mipmapped, a little anisotropy for people seen at a slant.
 */
export function citizenTextures(base='/'){
 const loader=new TextureLoader(),cache=new Map();
 return archetype=>{
  if(!archetype.texture)return null;
  let t=cache.get(archetype.texture);
  if(!t){
   t=loader.load(base+archetype.texture.replace(/^\//,''));
   t.flipY=false;t.colorSpace=SRGBColorSpace;t.anisotropy=4;
   t.minFilter=LinearMipmapLinearFilter;t.magFilter=LinearFilter;
   cache.set(archetype.texture,t);
  }
  return t;
 };
}

/**
 * The citizens pack once it is in, for the near pool (src/player/character-asset.mjs): its
 * archetypes are built from the pack's L0 meshes. {manifest, bin, texture, skins} or null.
 */
/** @type {{current: any}} */
export const CITIZEN_PACK={current:null};
