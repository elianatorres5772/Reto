import { test as base, expect, type Page, type Download } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { contracts, type ToolName } from '../../src/contracts/proveedor.js';

// Cada test obtiene un contexto de navegador y una sesión nuevos. El proveedor LLM se simula en backend, sin tráfico externo.
export const test=base.extend<{guardBrowser:void}>({
  guardBrowser:[async({page},use)=>{
    const errors:string[]=[],external:string[]=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',async route=>{
      const u=new URL(route.request().url());
      if(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&['3101','3102','3103'].includes(u.port))await route.continue();
      else{external.push(u.origin);await route.abort();}
    });
    await use();expect(errors,'Errores JavaScript del navegador').toEqual([]);expect(external,'No debe haber llamadas externas').toEqual([]);
  },{auto:true}]
});
export {expect};
export async function openChat(page:Page,url='/') {
  await page.goto(url);await expect(page.getByLabel('Solicitud',{exact:true})).toBeEnabled();
  await expect(page.locator('#mode')).toHaveText('Modo sin LLM');
}
export async function turn(page:Page,action:()=>Promise<unknown>) {
  const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/chat')&&r.request().method()==='POST');
  await action();const response=await responsePromise;expect(response.status()).toBe(200);
  await expect(page.getByLabel('Mensaje',{exact:true})).toBeEnabled();await expect(page.locator('#thinking')).toBeHidden();
}
export async function command(page:Page,text:string) {
  await page.getByLabel('Mensaje',{exact:true}).fill(text);
  await turn(page,()=>page.getByRole('button',{name:'Enviar',exact:true}).click());
}
export async function selectCase(page:Page,id:string) {
  if(await page.getByLabel('Solicitud',{exact:true}).inputValue()!==id)
    await turn(page,()=>page.getByLabel('Solicitud',{exact:true}).selectOption(id));
}
export function toolCard(page:Page,name:ToolName) {return page.locator('details.tool').filter({has:page.locator('summary').filter({hasText:name})}).last();}
export async function toolResult<N extends ToolName>(page:Page,name:N):Promise<z.infer<(typeof contracts)[N]['output']>> {
  const card=toolCard(page,name);await expect(card).toBeAttached();
  return contracts[name].output.parse(JSON.parse(await card.locator('pre').nth(1).textContent()??'null')) as z.infer<(typeof contracts)[N]['output']>;
}
export async function downloadBytes(download:Download) {
  expect(await download.failure()).toBeNull();const path=await download.path();expect(path).not.toBeNull();return readFile(path!);
}
