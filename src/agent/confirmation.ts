import type { CriticalAction } from '../contracts/proveedor.js';
export type Pending = { action:CriticalAction; caseId:string; artifactId:string; question:string };
const affirmative = /^(sí|si|confirmo|confirmar|acepto|de acuerdo|yes)[.!]?$/iu;
export class ConfirmationGate {
  private pending:Pending|null=null;
  private grant:Pending|null=null;
  private turn=0;
  private askedAfter=-1;
  ask(request:Pending) { this.pending=request;this.grant=null;this.askedAfter=this.turn;return request; }
  userTurn(text:string):Pending|null {
    this.turn++;
    this.grant=null;
    const p=this.pending;
    this.pending=null;
    if(p && this.askedAfter===this.turn-1 && affirmative.test(text.trim())) {this.grant=p;return p;}
    return null;
  }
  consume(action:CriticalAction,caseId:string,artifactId:string):boolean {
    const p=this.grant;this.grant=null;
    return !!p && p.action===action && p.caseId===caseId && p.artifactId===artifactId;
  }
  clear() {this.pending=null;this.grant=null;this.askedAfter=-1;}
  status() {return this.pending;}
}
