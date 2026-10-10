export type Message={role:'system'|'user'|'assistant'|'tool';content:string};
export type ToolDefinition={name:string;description:string;parameters:unknown};
export type ModelReply={ok:true;data:unknown;usage:{input:number;output:number}}|{ok:false;error:{code:'TIMEOUT'|'PROVIDER_ERROR'|'INVALID_RESPONSE'|'UNSUPPORTED_PROVIDER';message:string}};
export interface LlmAdapter {
 readonly provider:string;
 readonly model:string;
 enviar(mensajes:Message[],herramientas:ToolDefinition[],options:{name:string;schema:unknown;maxOutputTokens:number;timeoutMs:number}):Promise<ModelReply>;
}
