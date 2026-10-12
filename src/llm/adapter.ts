export type Message={role:'system'|'user'|'assistant'|'tool';content:string};
export type ToolDefinition={name:string;description:string;parameters:unknown};
export type ModelReply={ok:true;data:unknown;usage:{input:number;output:number}}|{ok:false;error:{code:'TIMEOUT'|'PROVIDER_ERROR'|'INVALID_RESPONSE'|'UNSUPPORTED_PROVIDER';message:string}};
// Ciclo con herramientas, neutral al proveedor. `raw` conserva el turno del asistente tal como lo devolvió
// el proveedor (incluido su razonamiento) para reenviarlo sin cambios en la siguiente llamada.
export type AgentToolCall={id:string;name:string;input:unknown};
export type AgentTurn=
 |{role:'user';text?:string;toolResults?:{id:string;content:string;isError:boolean}[]}
 |{role:'assistant';text:string;toolCalls:AgentToolCall[];raw:unknown};
export type AgentReply={ok:true;data:{text:string;toolCalls:AgentToolCall[];raw:unknown;stop:'tool_use'|'end'|'max_tokens'|'refusal'};usage:{input:number;output:number}}|{ok:false;error:{code:'TIMEOUT'|'PROVIDER_ERROR'|'INVALID_RESPONSE';message:string}};
export interface LlmAdapter {
 readonly provider:string;
 readonly model:string;
 enviar(mensajes:Message[],herramientas:ToolDefinition[],options:{name:string;schema:unknown;maxOutputTokens:number;timeoutMs:number}):Promise<ModelReply>;
 // Opcional: un proveedor sin este método usa el modo de intención (`enviar`).
 conversar?(system:string,turnos:AgentTurn[],herramientas:ToolDefinition[],options:{maxOutputTokens:number;timeoutMs:number}):Promise<AgentReply>;
}
