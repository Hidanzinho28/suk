'use strict';
const {PaymentError}=require('./payment-rules.cjs');
function reply(res,status,value) {res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');res.statusCode=status;res.end(JSON.stringify(value));}
function wrap(method,fn) {return async(req,res)=>{try {if(req.method!==method) {res.setHeader('Allow',method);throw new PaymentError(405,'Método não permitido.');} await fn(req,res);} catch(error) {const known=error instanceof PaymentError;if(!known) console.error('OSUK: erro interno na integração de pagamento.');const code=known&&typeof error.code==='string'&&/^[A-Z][A-Z0-9_]{1,79}$/.test(error.code)?error.code:undefined;reply(res,known?error.status:503,{error:known?error.message:'Não foi possível consultar o pagamento agora. Tente novamente em instantes.',...(code?{code}:{})});}};}
function sameOrigin(req) {
  const host=req.headers.host,origin=req.headers.origin;
  const dns=/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?::443)?$/i;
  if(typeof host!=='string'||host.length>259||!dns.test(host)||typeof origin!=='string')
    throw new PaymentError(403,'Origem da compra não autorizada.');
  // Host identifica o domínio acessado na Vercel (produção, preview ou domínio próprio).
  // Origin nunca é usado para decidir qual domínio será aceito.
  if(origin!==new URL('https://'+host).origin)throw new PaymentError(403,'Origem da compra não autorizada.');
}
async function rawBody(req,limit=65536) {const chunks=[];let size=0;for await(const chunk of req) {const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=buffer.length;if(size>limit) throw new PaymentError(413,'Requisição muito grande.');chunks.push(buffer);}return Buffer.concat(chunks);}
async function jsonBody(req) {
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')) throw new PaymentError(415,'Envie os dados em JSON.');
  try {const body=req.body;if(body && typeof body==='object' && !Buffer.isBuffer(body)) {if(Buffer.byteLength(JSON.stringify(body))>4096) throw new PaymentError(413,'Requisição muito grande.');return body;}const raw=body!=null?String(body):(await rawBody(req,4096)).toString('utf8');if(Buffer.byteLength(raw)>4096) throw new PaymentError(413,'Requisição muito grande.');return JSON.parse(raw);} catch(error) {if(error instanceof PaymentError) throw error;throw new PaymentError(400,'Dados de compra inválidos.');}
}
module.exports={reply,wrap,sameOrigin,rawBody,jsonBody};
