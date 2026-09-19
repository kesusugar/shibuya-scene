import test from 'node:test';
import assert from 'node:assert/strict';
import {createNearCharacters} from '../src/life/near-characters.mjs';
const people=Array.from({length:50},(_,id)=>({id,active:true,archetype:'casual',x:id*.1,z:2,height:0,heading:0,speed:1}));
test('near rigs allocate only on demand, grow gradually and share buffers',()=>{
 const p=createNearCharacters('high');p.update(people,null,.016);assert.equal(p.inspect().capacity,0);
 p.update(people,{x:0,z:0},.016);assert.equal(p.inspect().active,1);
 for(let i=0;i<40;i++)p.update(people,{x:0,z:0},.016);assert.equal(p.inspect().active,32);
 const a=p.root.children[0].getObjectByName('HeroMaterial0'),b=p.root.children[1].getObjectByName('HeroMaterial0');assert.equal(a.geometry,b.geometry);assert.notEqual(a.skeleton,b.skeleton);
 p.setTier('low');p.update(people,{x:0,z:0},.016);assert.equal(p.inspect().active,4);assert.equal(p.inspect().capacity,4);
 p.update(people,null,.016);assert.equal(p.inspect().active,0);assert.ok(p.root.children.every(o=>!o.visible));p.dispose();p.dispose();assert.equal(p.root.children.length,0);
});
test('hysteresis retains nearby identity; hit bodies fall back to the existing renderer',()=>{
 const p=createNearCharacters('low'),person={...people[0],x:24};p.update([person],{x:0,z:0},.05);assert.ok(p.selected.has(person.id));
 person.x=28;p.update([person],{x:0,z:0},.05);assert.ok(p.selected.has(person.id));
 person.struck=0;p.update([person],{x:0,z:0},.05);assert.equal(p.selected.size,0);delete person.struck;
 p.update([person],{x:0,z:0},.05);assert.equal(p.selected.size,0);p.dispose();
});
