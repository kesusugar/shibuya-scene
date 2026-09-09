import {HERO_IDS} from '../data/normalize.mjs';
export const BUILDINGS=Object.freeze({limit:250,roadConflictRatio:.25,roadConflictArea:10,floorHeight:3.4,base:.15,minHeight:3.4,maxHeight:180,minArea:4,maxArea:50000,windowOffset:.035,windowPitch:2.8,roofMargin:.4,maxWindowsPerBuilding:1400});
export const ARCHETYPES=['plain','shop','band','grid','balcony','curtain','zakkyo'];
// Additional Mark City West footprint, not a dedicated building builder.
export const RESERVED_IDS=new Set([...Object.values(HERO_IDS),'way/54500467']);
export function reservationReason(source,landmarks={}){
 if(RESERVED_IDS.has(source.id)||Object.values(landmarks).some(h=>h.id===source.id))return 'hero-definition';
 if(source.tags?.building==='train_station'||source.tags?.railway==='station')return 'station-structure';
 return null;
}
export const ARCHETYPE_COLORS={plain:0xb4afa4,shop:0xb9a78b,band:0xb1b8ba,grid:0xa3acb0,balcony:0xbdafa0,curtain:0x697b88,zakkyo:0x9b9690};
