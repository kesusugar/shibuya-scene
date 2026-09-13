import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {staticModelKey,STATIC_SCHEMA} from '../build/static-model-key.mjs';
import {buildGroundModel} from '../src/ground/model.mjs';
import {buildBuildingModel} from '../src/buildings/model.mjs';
import {buildStationModel} from '../src/station/model.mjs';
import {buildDetailModel} from '../src/station-detail/model.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),target=resolve(root,'public/data/shibuya-static-models.json'),signature=staticModelKey(root);
if(existsSync(target)&&JSON.parse(readFileSync(target,'utf8')).key===signature.key){console.log('Static models are current:',signature.key);process.exit(0);}
if(process.argv.includes('--check'))throw Error('Static models are stale. Run npm run bake:static');
const data=JSON.parse(readFileSync(resolve(root,'public/data/shibuya-scene-data.json'),'utf8')),timings={};
function measure(name,run){const start=performance.now(),model=run();timings[name]=Math.round(performance.now()-start);console.log(name,timings[name]+' ms');return model;}
const ground=measure('ground',()=>buildGroundModel(data));
const generic=measure('generic',()=>buildBuildingModel(data));
const station=measure('station',()=>buildStationModel(data,{ground,generic}));
const detail={};
for(const tier of ['high','medium','low'])detail[tier]=measure('detail-'+tier,()=>buildDetailModel(data,{ground,generic,core:station,tier}));
const artifact={schema:STATIC_SCHEMA,key:signature.key,timings,ground,generic,station,detail};
const json=JSON.stringify(artifact);
mkdirSync(resolve(root,'public/data'),{recursive:true});writeFileSync(target,json);
console.log('Baked bytes:',Buffer.byteLength(json),'key:',signature.key);
