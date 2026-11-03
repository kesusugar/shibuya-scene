import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareHero} from '../src/heroes/model.mjs';
import {HERO_DEFINITIONS} from '../src/heroes/config.mjs';
import {buildQFront} from '../src/heroes/builders.mjs';
import {refineQfrontGlass} from '../src/heroes/qfront-glass.mjs';
test('QFRONT retains cafe and surveyed footprint with a fine curtain-wall finish',()=>{
 const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
 const h=prepareHero(data,HERO_DEFINITIONS.find(h=>h.key==='qfront'));buildQFront(h);
 const footprint=JSON.stringify(h.footprint),anchors=JSON.stringify(h.anchors);refineQfrontGlass(h);
 assert.equal(JSON.stringify(h.footprint),footprint);assert.equal(JSON.stringify(h.anchors),anchors);
 // Reality alignment G2-2: the storeys are glass; the crown screen keeps its metal.
 assert.ok(h.masses.filter(m=>m.bottom>=7.5&&m.label!=='roof-crown').every(m=>m.material==='qfrontGlass'));
 assert.equal(h.masses.find(m=>m.label==='roof-crown').material,'metal');
 assert.ok(h.panels.every(p=>p.position[1]<8));
 assert.ok(h.details.filter(d=>d.role==='curtain-mullion').length>70);
 for(const d of h.details){assert.ok([...d.position,...d.scale].every(Number.isFinite));if(d.role==='curtain-mullion'&&Math.cos(d.heading)>.95){const lo=d.position[1]-d.scale[1]/2,hi=d.position[1]+d.scale[1]/2;assert.ok(hi<h.screenBottom+.1||lo>h.screenBottom+h.screenHeight-.1,'front mullions must not cross the monitor');}}
});
