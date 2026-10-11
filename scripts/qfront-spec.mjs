// Cityscape C2: QFRONT's surveyed geometry for the Blender build (scripts/blender/build-qfront.py).
//
//   node scripts/qfront-spec.mjs <out.json>
//
// The masses, footprint and primary facade come from the same hero model the scene builds
// (src/heroes), so the Blender asset lands on the building by construction: scene metres, X east,
// Y up, Z south. Blender's Z-up is applied once, in the Blender script.
import {readFileSync,writeFileSync} from 'node:fs';
import {HERO_DEFINITIONS} from '../src/heroes/config.mjs';
import {prepareHero,edges} from '../src/heroes/model.mjs';
import {BUILDERS} from '../src/heroes/builders.mjs';
const out=process.argv[2];if(!out)throw new Error('usage: node scripts/qfront-spec.mjs <out.json>');
const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json','utf8'));
const def=HERO_DEFINITIONS.find(d=>d.key==='qfront');
const h=prepareHero(data,def);BUILDERS[def.builder](h);
const ring=p=>p.outer.map(([x,z])=>[+x.toFixed(3),+z.toFixed(3)]);
const front=edges(h.footprint).filter(e=>e.length>3&&e.normal[0]*h.primaryFacade.direction[0]+e.normal[1]*h.primaryFacade.direction[1]>.85);
const spec={id:def.id,height:def.height,footprint:ring(h.footprint),
 masses:h.masses.map(m=>({label:m.label,bottom:m.bottom,top:m.top,polygon:ring(m.polygon)})),
 primary:{direction:h.primaryFacade.direction,a:h.primaryFacade.a,b:h.primaryFacade.b},
 front:front.map(e=>({a:e.a,b:e.b,normal:e.normal,length:e.length})),
 screen:{bottom:def.screenBottom,height:def.screenHeight}};
writeFileSync(out,JSON.stringify(spec,null,1));
console.log(`${def.key}: ${spec.masses.length} masses, ${spec.front.length} front edges -> ${out}`);
