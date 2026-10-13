const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function check(test,message){if(!test)throw Error(message);}
const config={window:{},location:{protocol:'https:',origin:'https://novo-projeto.vercel.app'}};
vm.runInNewContext(fs.readFileSync(path.join(root,'public/config.js'),'utf8'),config);
check(config.window.OSUK_CONFIG.commerce.apiBase==='/api','A conexão com a API está ausente.');
check(config.window.OSUK_CONFIG.commerce.provider==='BukioPay','O gateway não é BukioPay.');
check(config.window.OSUK_CONFIG.siteUrl===config.location.origin,'O domínio precisa ser automático.');
const catalog=require('../osuk-server/fulfillment-catalog.json');let count=0;
for(const file of fs.readdirSync(path.join(root,'public')).filter(name=>name.endsWith('.html'))){
 const text=fs.readFileSync(path.join(root,'public',file),'utf8');
 const ids=[...text.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);check(new Set(ids).size===ids.length,'IDs duplicados em '+file);
 for(const [,url] of text.matchAll(/\b(?:href|src)="([^"]+)"/g)){
  if(!/^(?:https?:|data:|#)/.test(url))check(fs.existsSync(path.join(root,'public',url.split(/[?#]/)[0])),'Arquivo ausente em '+file+': '+url);
 }
 for(const item of Object.values(catalog)){check(!text.includes(item.downloadUrl)&&!text.includes(item.tutorialUrl),'Link privado no HTML: '+file);}
 count++;
}
for(const name of ['orders.js','orders/prepare.js','orders/current.js','health.js'])check(typeof require(path.join(root,'api',name))==='function','API inválida: '+name);
check(typeof require('qrcode').toDataURL==='function','Dependência QR Code ausente.');
console.log('Site completo verificado: '+count+' páginas, imagens, APIs e domínio automático. Nenhuma cobrança foi criada.');
