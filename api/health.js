const {reply,wrap}=require('../osuk-server/http.cjs');
module.exports=wrap('GET',async(req,res)=>{const missing=process.env.BUKIOPAY_API_KEY?.trim()?[]:['BUKIOPAY_API_KEY'];reply(res,missing.length?503:200,{status:missing.length?'configuration_required':'configuration_present',missing,provider:'BukioPay',mode:'api_confirmation',paymentVerified:false});});
