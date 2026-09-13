import expectedKey from 'virtual:shibuya-static-key';
import {restoreGroundModel} from '../ground/model.mjs';
let pending;
export function loadStaticModels(){
 if(typeof location!=='undefined'&&new URLSearchParams(location.search).get('prebuilt')==='0')return Promise.resolve(null);
 return pending??=fetch('data/shibuya-static-models.json').then(async response=>{
  if(!response.ok)throw Error('HTTP '+response.status);
  const pack=await response.json();
  if(pack.schema!==1||pack.key!==expectedKey)throw Error('stale static models');
  pack.ground=restoreGroundModel(pack.ground);
  console.info('[Static models] loaded',pack.key,pack.timings);
  return pack;
 }).catch(error=>{console.warn('[Static models] runtime fallback',String(error));return null;});
}
