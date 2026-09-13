import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';

process.env.SHIBUYA_LOCAL_NODE='1';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=await createServer({root,server:{host:'127.0.0.1',port:5174,strictPort:true}});
await server.listen();
server.printUrls();
