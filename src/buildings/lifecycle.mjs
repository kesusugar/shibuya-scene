import {loadSceneData} from '../data/normalize.mjs';
import {buildBuildings} from './render.mjs';
/** Local S3 adapter: stale loads cannot resurrect a disabled/disposed module. */
export function buildingLifecycle({parent,onReport=()=>{},onReady=()=>{},onError=()=>{},load=loadSceneData,build=buildBuildings,schedule=run=>run()}){
 let generation=0,current=null,abort=null;
 return {build(){const token=++generation;abort=new AbortController();onReport({status:'building'});load(undefined,{signal:abort.signal}).then(data=>schedule(()=>{if(token!==generation)return;current=build(data);parent.add(current.root);onReport(current.stats);onReady(current);})).catch(e=>{if(token===generation){onReport({error:String(e)});onError(e);}});},dispose(){generation++;abort?.abort();current?.dispose();current=null;onReport(null);},get current(){return current;}};
}
