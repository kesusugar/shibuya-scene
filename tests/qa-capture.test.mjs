import test from 'node:test';import assert from 'node:assert/strict';
import {parseConfig} from '../src/app/foundation.mjs';
import {QA_CAPTURES,publicCameraName,crc32,createZip} from '../src/qa/capture.mjs';

test('QA URL fixes HIGH and accepts public camera aliases',()=>{const q=parseConfig('?qa=1&tier=low&time=night&camera=scramble-street');assert.equal(q.qa,true);assert.equal(q.tier,'high');assert.equal(q.time,'night');assert.equal(q.camera,'street');assert.equal(publicCameraName(q.camera),'scramble-street');assert.equal(parseConfig('?camera=qfront').camera,'qfront');});
test('QA capture manifest contains the five required images',()=>{assert.deepEqual(QA_CAPTURES.map(x=>x.file),['overview-day.png','overview-night.png','scramble-street-day.png','scramble-street-night.png','qfront-night.png']);});
test('QA ZIP writer emits valid store headers and CRC32',async()=>{assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);const zip=new Uint8Array(await (await createZip([{name:'shibuya-qa-pack/metrics.json',blob:new Blob(['{}'])}])).arrayBuffer());const view=new DataView(zip.buffer);assert.equal(view.getUint32(0,true),0x04034b50);assert.equal(view.getUint32(zip.length-22,true),0x06054b50);assert.match(new TextDecoder().decode(zip),/shibuya-qa-pack\/metrics\.json/);});
