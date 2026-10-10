import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createProveedorTools } from './src/tools/proveedor.js';
import { ConfirmationGate } from './src/agent/confirmation.js';
import { toolNames, type CriticalAction } from './src/contracts/proveedor.js';

async function demo() {
  const catalog=await createProveedorTools().listCases();
  assert.ok(catalog.ok,'El catálogo debe ser válido');
  assert.equal(catalog.data.length,4,'Deben ejecutarse los cuatro casos suministrados');
  const reports=[];
  for(const item of catalog.data) {
    const gate=new ConfirmationGate();
    let evaluation='';
    const tools=createProveedorTools({outputRoot:'outputs/demo',authorize:(...args)=>gate.consume(...args),today:()=>evaluation});
    const calls=new Set<string>();
    const call=async<N extends typeof toolNames[number]>(name:N,input:unknown)=>{calls.add(name);return tools.execute(name,input);};
    const confirm=(action:CriticalAction,id:string)=>{
      gate.ask({action,caseId:item.id,artifactId:id,question:'¿Confirmas esta acción de prueba?'});
      assert.ok(gate.userTurn('sí'));
    };
    const read=await call('proveedor_leer_solicitud',{caso_id:item.id});assert.ok(read.ok);
    evaluation=read.data.solicitud.fecha;
    const mapped=await call('proveedor_mapear_campos',{caso_id:item.id});assert.ok(mapped.ok);
    const generated=await call('proveedor_generar_formulario',{caso_id:item.id});
    let packageResult,simulation;
    if(generated.ok) {
      const args={caso_id:item.id,formulario_id:generated.data.artefacto.id,fecha_evaluacion:evaluation};
      const denied=await call('proveedor_armar_paquete',args);assert.equal(denied.ok,false);
      if(!denied.ok)assert.equal(denied.error.code,'CONFIRMATION_REQUIRED');
      confirm('proveedor_armar_paquete',args.formulario_id);
      packageResult=await call('proveedor_armar_paquete',args);assert.ok(packageResult.ok);
      const sendArgs={caso_id:item.id,paquete_id:packageResult.data.paquete.id};
      const deniedSend=await call('proveedor_simular_envio',sendArgs);assert.equal(deniedSend.ok,false);
      if(!deniedSend.ok)assert.equal(deniedSend.error.code,'CONFIRMATION_REQUIRED');
      confirm('proveedor_simular_envio',sendArgs.paquete_id);
      simulation=await call('proveedor_simular_envio',sendArgs);
      if(item.id==='co-industrias-delta'){assert.ok(simulation.ok);assert.equal(packageResult.data.soportes.length,4);}
      if(item.id==='ec-corp-andina'){assert.deepEqual(packageResult.data.soportes_faltantes,['certificado_cumplimiento_tributario']);assert.equal(simulation.ok,false);}
      if(item.id==='hn-agroexport-sula'){assert.deepEqual(packageResult.data.campos_faltantes,['Referencias comerciales']);assert.equal(simulation.ok,false);}
    } else {
      assert.equal(item.formato,'portal');assert.equal(generated.error.code,'PORTAL_MANUAL');
      packageResult=await call('proveedor_armar_paquete',{caso_id:item.id,formulario_id:randomUUID()});
      simulation=await call('proveedor_simular_envio',{caso_id:item.id,paquete_id:randomUUID()});
      assert.equal(packageResult.ok,false);assert.equal(simulation.ok,false);
    }
    assert.equal(calls.size,5,'Se deben ejecutar las cinco herramientas por caso');
    reports.push({caso:item.id,fecha_evaluacion:evaluation,campos_mapeados:mapped.data.campos.filter(f=>f.estado==='mapeado').length,campos_pendientes:mapped.data.campos.filter(f=>f.estado!=='mapeado').map(f=>f.etiqueta),formulario:generated.ok?'borrador generado':generated.error.code,paquete:packageResult.ok?{soportes:packageResult.data.soportes.map(s=>({tipo:s.tipo,estado:s.estado})),faltantes:packageResult.data.soportes_faltantes}:packageResult.error.code,simulacion:simulation.ok?'simulada sin envío real':simulation.error.code});
  }
  console.log(JSON.stringify({modo:'Sin LLM; evaluación histórica reproducible a la fecha de cada solicitud, no acredita vigencia actual.',casos_ejecutados:reports.length,herramientas_por_caso:5,resultados:reports},null,2));
}
demo().catch(()=>{console.error('Demo fallido: los resultados no cumplen las expectativas de los fixtures. Ejecuta npm test para el diagnóstico.');process.exitCode=1;});
