import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';

// Optional file-backed HTTP routing for offline / network-restricted browser checks.
export async function localPreview(context, origin) {
  if(!process.env.PREVIEW_ROOT)return;
  const root=path.resolve(process.env.PREVIEW_ROOT);
  await context.route(origin+'/**',async route=>{
    let file=path.resolve(root,'.'+decodeURIComponent(new URL(route.request().url()).pathname));
    if(file!==root&&!file.startsWith(root+path.sep))return route.abort();
    try{
      if((await stat(file)).isDirectory())file=path.join(file,'index.html');
      await route.fulfill({status:200,body:await readFile(file),contentType:({'.js':'text/javascript','.html':'text/html','.css':'text/css','.woff2':'font/woff2','.jpg':'image/jpeg'})[path.extname(file)]||'application/octet-stream'});
    }catch{await route.fulfill({status:404,body:'missing'});}
  });
}
