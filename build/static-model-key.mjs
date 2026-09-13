import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative} from 'node:path';
export const STATIC_SCHEMA=1;
export const STATIC_ROOTS=['src/ground/model.mjs','src/buildings/model.mjs','src/station/model.mjs','src/station-detail/model.mjs'];
export function staticModelKey(root){
 const files=new Set(['public/data/shibuya-scene-data.json','package-lock.json']);
 function visit(file){if(files.has(file))return;files.add(file);const text=readFileSync(resolve(root,file),'utf8');for(const match of text.matchAll(/from\s+['"]([^'"]+)['"]/g)){if(match[1].startsWith('.'))visit(relative(root,resolve(root,dirname(file),match[1])).replaceAll('\\','/'));}}
 STATIC_ROOTS.forEach(visit);
 const hash=createHash('sha256').update(String(STATIC_SCHEMA));
 for(const file of [...files].sort())hash.update(file).update(readFileSync(resolve(root,file)));
 return {key:hash.digest('hex'),files:[...files].sort()};
}
export function staticModelVersionPlugin(root){
 const id='\0virtual:shibuya-static-key';
 return {name:'shibuya-static-version',resolveId(source){if(source==='virtual:shibuya-static-key')return id;},load(source){if(source===id)return 'export default '+JSON.stringify(staticModelKey(root).key);},handleHotUpdate(ctx){const paths=staticModelKey(root).files.map(f=>resolve(root,f));if(paths.includes(resolve(ctx.file))){const mod=ctx.server.moduleGraph.getModuleById(id);if(mod)ctx.server.moduleGraph.invalidateModule(mod);ctx.server.ws.send({type:'full-reload'});}}};
}
