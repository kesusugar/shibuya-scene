export const PROFILES = Object.freeze({high:{dpr:1.5,scale:1,fps:60,textureSize:2048},medium:{dpr:1.25,scale:.6,fps:30,textureSize:1024},low:{dpr:1,scale:.3,fps:24,textureSize:512}});
export const CAMERAS = Object.freeze([
{id:'overview',label:'CAM-01 Overview',position:[260,300,260],target:[0,0,0]},
{id:'scramble',label:'CAM-02 Scramble High',position:[55,70,65],target:[0,0,0]},
{id:'street',label:'CAM-03 Scramble Street',position:[18,1.7,28],target:[-12,8,-25]},
{id:'qfront',label:'CAM-04 QFRONT',position:[20,12,28],target:[-28,25,-36]},
{id:'hachiko',label:'CAM-05 Hachiko',position:[-25,15,25],target:[30,8,50]},
{id:'109',label:'CAM-06 109',position:[0,5,0],target:[-150,25,-10]},
{id:'center-gai',label:'CAM-07 Center-gai',position:[-25,2,-30],target:[-100,8,-70]},
{id:'photo',label:'CAM-08 Night Photo',position:[42,8,45],target:[-25,20,-35],time:'night'},
{id:'station',label:'Station inspection',position:[100,65,130],target:[45,15,70]}]);
export const MODULES = ['geo','data','ground','buildings','station','signs','streetscape','traffic','life','trains','construction','environment','nightglow','postprocess','perf','camera','debug'];
export function parseConfig(search='') {const q=new URLSearchParams(search);const list=k=>q.has(k)?q.get(k).split(',').map(s=>s.trim()).filter(Boolean):null;return {tier:Object.hasOwn(PROFILES,q.get('tier'))?q.get('tier'):'medium',camera:CAMERAS.some(c=>c.id===q.get('camera'))?q.get('camera'):'overview',time:q.get('time')==='night'?'night':'day',explicitTime:q.has('time'),only:list('only'),skip:list('skip')??[],debug:q.get('debug')==='1'};}
export class TimeState {constructor(value='day'){this.value=value;this.listeners=new Set();}isDark(){return this.value==='night';}get emissiveScale(){return this.isDark()?1:.15;}get grade(){return this.value;}set(value){if(!['day','night'].includes(value))throw new Error('Invalid time');if(this.value===value)return;this.value=value;for(const f of this.listeners)f(this);}subscribe(f){this.listeners.add(f);return()=>this.listeners.delete(f);}}
export class ModuleSystem {
 constructor(config,context){this.context=context;this.entries=new Map();this.config=config;}
 register(id,hooks={}){if(this.entries.has(id))throw new Error('Duplicate module '+id);this.entries.set(id,{id,hooks,enabled:false,status:'disabled',error:null});}
 setEnabled(id,enabled){const m=this.entries.get(id);if(!m)throw new Error('Unknown module '+id);if(m.enabled===enabled)return;try{if(enabled){m.hooks.build?.(this.context);m.enabled=true;m.status=m.hooks.build?'ready':'stub';}else{m.hooks.dispose?.();m.enabled=false;m.status='disabled';}}catch(e){m.enabled=false;m.status='failed';m.error=String(e);try{m.hooks.dispose?.();}catch{} } }
 start(){for(const id of this.entries.keys())this.setEnabled(id,(this.config.only===null||this.config.only.includes(id))&&!this.config.skip.includes(id));}
 update(dt){for(const m of this.entries.values())if(m.enabled){try{m.hooks.update?.(dt);}catch(e){m.error=String(e);this.setEnabled(m.id,false);m.status='failed';}}}
 timeChanged(time){for(const m of this.entries.values())if(m.enabled){try{m.hooks.onTimeChange?.(time);}catch(e){m.error=String(e);this.setEnabled(m.id,false);m.status='failed';}}}
 snapshot(){return [...this.entries.values()].map(({id,enabled,status,error})=>({id,enabled,status,error}));}
 dispose(){for(const id of this.entries.keys())this.setEnabled(id,false);}
}
