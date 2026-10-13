'use strict';
const crypto=require('node:crypto');
const rules=require('./payment-rules.cjs');
const {fulfillmentForVerifiedOrder}=require('./fulfillment.cjs');
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const validKey=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const isBukioPayToken=value=>typeof value==='string'&&value.startsWith('osuku1_');
const states=Object.freeze({pending:'pending',paid:'approved',expired:'cancelled',refunded:'refunded'});

// Campo 54 do código EMV: total efetivamente apresentado ao pagador, incluindo taxa.
function pixTotal(code) {
  for(let offset=0;offset+4<=code.length;) {
    const tag=code.slice(offset,offset+2),size=code.slice(offset+2,offset+4);
    if(!/^\d{2}$/.test(tag)||!/^\d{2}$/.test(size)) return null;
    const end=offset+4+Number(size);if(end>code.length) return null;
    const value=code.slice(offset+4,end);
    if(tag==='54') return /^\d{1,7}\.\d{2}$/.test(value)?rules.amountCents(Number(value)):null;
    offset=end;
  }
  return null;
}

function createService({env=process.env,fetcher=fetch,clock=Date.now,qrCode}={}) {
  function apiKey() {
    const key=env.BUKIOPAY_API_KEY?.trim();
    if(!key) throw new rules.PaymentError(503,'Pagamento em configuração. Cadastre BUKIOPAY_API_KEY na Vercel.');
    return key;
  }
  const secret=()=>crypto.createHmac('sha256',apiKey()).update('OSUK BukioPay receipt v1').digest();
  const reference=p=>'osuku_'+crypto.createHmac('sha256',secret()).update(JSON.stringify([p.pack,p.email,p.key,p.amountCents])).digest('base64url');
  const description=order=>`OSUK | ${rules.products[order.pack].name} | ${order.key}`;
  function seal(order) {
    const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',secret(),iv);
    const encrypted=Buffer.concat([cipher.update(JSON.stringify(order),'utf8'),cipher.final()]);
    return 'osuku1_'+Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
  }
  function open(token) {
    apiKey();
    try {
      if(typeof token!=='string'||!/^osuku1_[A-Za-z0-9_-]{80,1500}$/.test(token)) throw Error();
      const encoded=token.slice(7),bytes=Buffer.from(encoded,'base64url');
      if(bytes.toString('base64url')!==encoded) throw Error();
      const decipher=crypto.createDecipheriv('aes-256-gcm',secret(),bytes.subarray(0,12));
      decipher.setAuthTag(bytes.subarray(12,28));
      const order=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8'));
      if(order.v!==1||!Object.hasOwn(rules.products,order.pack)||!/^osuku_[A-Za-z0-9_-]{43}$/.test(order.id)||!validKey(order.key)||
        typeof order.email!=='string'||order.email.length>254||order.amountCents!==rules.products[order.pack].amountCents||
        !Number.isSafeInteger(order.expiresAt)||order.expiresAt<=clock()||
        (order.providerId!==null&&!validId(order.providerId))||
        (order.providerId!==null&&(!Number.isFinite(Date.parse(order.pixExpiresAt||''))||!Number.isSafeInteger(order.paymentAmountCents)||order.paymentAmountCents<order.amountCents))) throw Error();
      return order;
    } catch {
      const error=new rules.PaymentError(401,'Este acesso de compra não é mais válido. Se já pagou, fale no Discord para recuperar o pedido.');
      error.code='ORDER_ACCESS_INVALID';throw error;
    }
  }
  async function request(route,body,idempotencyKey) {
    const operation=body?'criar':'consultar';let response;
    try {
      response=await fetcher('https://bukio.up.railway.app/v1'+route,{
        method:body?'POST':'GET',redirect:'error',headers:{Authorization:'Bearer '+apiKey(),Accept:'application/json',...(body?{'Content-Type':'application/json','Idempotency-Key':idempotencyKey}:{})},
        body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)
      });
    } catch {
      console.error('OSUK Pix',JSON.stringify({provider:'BukioPay',operation,code:'NETWORK_OR_TIMEOUT'}));
      throw new rules.PaymentError(502,'A comunicação do Pix falhou. Tente novamente com o mesmo e-mail para recuperar a mesma cobrança.');
    }
    let data;try {data=await response.json();} catch {
      console.error('OSUK Pix',JSON.stringify({provider:'BukioPay',operation,httpStatus:response.status,code:'INVALID_JSON'}));
      throw new rules.PaymentError(502,`Resposta inválida da BukioPay (HTTP ${response.status}). Tente novamente com o mesmo e-mail.`);
    }
    if(!response.ok||!data||typeof data!=='object'||Array.isArray(data)||data.error||data.success===false) {
      const rawCode=data?.error?.code??data?.code;
      const code=typeof rawCode==='string'&&/^[A-Z][A-Z0-9_]{1,79}$/.test(rawCode)?rawCode:'PROVIDER_ERROR';
      console.error('OSUK Pix',JSON.stringify({provider:'BukioPay',operation,httpStatus:response.status,code}));
      const hints={KYC_REQUIRED:'Conclua a verificação da conta na BukioPay.',PIX_IN_PAUSED:'O recebimento Pix está pausado na BukioPay.',MAINTENANCE:'A BukioPay está em manutenção.',IDEMPOTENCY_CONFLICT:'A identificação da tentativa já foi usada com outros dados. Confira o pedido no Discord.'};
      const hint=hints[code]||(response.status===401?'A chave da BukioPay não foi aceita.':response.status===403?'Confira as permissões payments:create e payments:get da chave.':response.status===429?'Aguarde antes de tentar novamente.':response.status>=500?'A BukioPay não concluiu a solicitação. Tente novamente com o mesmo e-mail.':'Confira o pedido no Discord.');
      throw new rules.PaymentError(response.status===429?429:502,`Falha ao ${operation} Pix (HTTP ${response.status} · ${code}). ${hint}`);
    }
    return data;
  }
  function verify(data,order) {
    if(!validId(data.id)||!Number.isSafeInteger(data.amount)||data.amount!==order.amountCents||data.description!==description(order)||
      (order.providerId!==null&&data.id!==order.providerId)||
      (data.method!=null&&data.method!=='pix')||(data.currency!=null&&data.currency!=='BRL')||
      (data.idempotencyKey!=null&&data.idempotencyKey!==order.key)||
      !Object.hasOwn(states,data.status)||
      (data.total!=null&&(!Number.isSafeInteger(data.total)||data.total<order.amountCents||
        (order.providerId!==null&&data.total!==order.paymentAmountCents))))
      throw new rules.PaymentError(502,'A cobrança retornou ID, valor, forma de pagamento ou status inesperados. Confira o pedido no Discord.');
    return states[data.status];
  }
  async function clientOrder(order,data) {
    const status=data?verify(data,order):'pending';let pix;
    if(data&&status==='pending') {
      pix=rules.validatePayment({id:data.id,amount:data.amount/100,copyPaste:data.copyPaste,expiresAt:data.expiresAt||order.pixExpiresAt},order).pix;
      // QR calculado a partir do copia e cola real retornado pelo provedor.
      pix.qrCodeBase64=await (qrCode||require('qrcode')).toDataURL(pix.copyPaste,{errorCorrectionLevel:'M',margin:4,width:320});
      const total=data.total??order.paymentAmountCents??data.amount,emvTotal=pixTotal(pix.copyPaste);
      if(!Number.isSafeInteger(total)||total<order.amountCents||(emvTotal!==null&&emvTotal!==total))
        throw new rules.PaymentError(502,'O total do código Pix não corresponde ao pedido. Confira no Discord.');
      pix.paymentAmountCents=total;pix.payerCoversFee=total>order.amountCents;
    }
    return {orderId:order.providerId||order.id,pack:order.pack,amountCents:order.amountCents,status,emailMasked:rules.maskEmail(order.email),
      lookupPending:!data,...(pix?{pix}:{}),...fulfillmentForVerifiedOrder({...order,status})};
  }
  async function prepare(body,idempotencyKey) {
    apiKey();const p=rules.validatePurchase(body,idempotencyKey);
    const order={v:1,id:reference(p),key:p.key,pack:p.pack,email:p.email,amountCents:p.amountCents,providerId:null,pixExpiresAt:null,paymentAmountCents:null,expiresAt:clock()+30*86400000};
    return {accessToken:seal(order),order:await clientOrder(order,null)};
  }
  async function createOrder(body,idempotencyKey,ip,token) {
    apiKey();const p=rules.validatePurchase(body,idempotencyKey);
    const accessToken=token||(await prepare(body,idempotencyKey)).accessToken,order=open(accessToken);
    if(order.id!==reference(p)||order.key!==p.key||order.pack!==p.pack||order.email!==p.email||order.amountCents!==p.amountCents)
      throw new rules.PaymentError(409,'O acesso não corresponde a esta compra. Reabra o pagamento.');
    if(order.providerId!==null) return {accessToken,order:await current(accessToken)};
    // O painel oficial envia Idempotency-Key para a criação; preserve a chave nas repetições.
    const data=await request('/payments',{amount:order.amountCents,method:'pix',description:description(order)},order.key);
    verify(data,order,true);
    const expiry=Date.parse(data.expiresAt||'');
    if(!Number.isFinite(expiry)) throw new rules.PaymentError(502,'O Pix retornou dados incompletos. Tente novamente com o mesmo e-mail para recuperar a cobrança.');
    const saved={...order,providerId:data.id,pixExpiresAt:new Date(expiry).toISOString(),paymentAmountCents:data.total??data.amount},nextToken=seal(saved);
    // Somente uma consulta autenticada confirma o pagamento para a entrega.
    if(data.status!=='pending') return {accessToken:nextToken,order:await current(nextToken)};
    return {accessToken:nextToken,order:await clientOrder(saved,data)};
  }
  async function current(token) {
    const order=open(token);
    if(order.providerId===null) return clientOrder(order,null);
    return clientOrder(order,await request('/payments/'+encodeURIComponent(order.providerId)));
  }
  return {prepare,createOrder,current};
}
module.exports={createService,isBukioPayToken,pixTotal};
