// Self-contained viewer: no server, module imports or image fetches needed.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const output=path.resolve(process.argv[2]||path.join(root,'outputs/dyson-offline.html'));
const exhibit=path.join(root,'exhibits/dyson');
let html=await readFile(path.join(exhibit,'index.html'),'utf8');
const styles=await Promise.all([path.join(root,'exhibits/shared/observation-report.css'),path.join(exhibit,'dyson.css')].map(f=>readFile(f,'utf8')));
const scripts=(await Promise.all(['depth.js','scene.js','energy.js','main.js'].map(f=>readFile(path.join(exhibit,f),'utf8')))).map(s=>s.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'')).join('\n');
html=html.replace(/<link rel="stylesheet"[^>]+>/g,'').replace('</head>',()=>'<style>'+styles.join('\n')+'</style></head>');
for(const name of ['concept-v1.png','interior-clean-v2.png']){
  const data=(await readFile(path.join(exhibit,'assets',name))).toString('base64');
  html=html.replaceAll('src="assets/'+name+'"','src="data:image/png;base64,'+data+'"');
}
html=html.replace(/<script type="module"[^>]*><\/script>/,()=>'<script type="module">'+scripts+'</script>');
html=html.replaceAll('href="../../"','href="https://yankcc258.github.io/test-sandbox/"').replaceAll('href="../roche/"','href="https://yankcc258.github.io/test-sandbox/exhibits/roche/"').replaceAll('href="../schwarzschild/"','href="https://yankcc258.github.io/test-sandbox/exhibits/schwarzschild/"');
await mkdir(path.dirname(output),{recursive:true});await writeFile(output,html);
console.log('Built '+output+' ('+Buffer.byteLength(html)+' bytes)');
