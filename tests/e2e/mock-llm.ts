// Se carga exclusivamente por el harness E2E, nunca desde producción.
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 if(String(input)!=='https://api.openai.com/v1/chat/completions')return originalFetch(input,init);
 const request=JSON.parse(String(init?.body));
 const payload=JSON.parse(request.messages[1].content);
 const result=payload.stage==='intent'?{intent:'consulta'}:payload.question.includes('inválida')?{status:'answered',evidence_ids:[999999]}:{status:'answered',evidence_ids:payload.evidence.filter((e:{label:string})=>e.label==='Cuenta bancaria (número)' || /n[uú]mero.*cuenta/i.test(e.label)).slice(0,1).map((e:{id:number})=>e.id)};
 return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}),{status:200});
};
