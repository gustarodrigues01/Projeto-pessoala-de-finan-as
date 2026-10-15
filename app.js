(function(){
'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const TODAY=iso(new Date());
const parse=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const addDays=(s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return iso(d)};
const addMonths=(s,n)=>{const d=parse(s);const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n);const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));return iso(d)};
const mk=s=>s.slice(0,7);
const shiftMonth=(k,n)=>mk(addMonths(k+'-01',n));
const monthLabel=(k,short)=>parse(k+'-01').toLocaleDateString('pt-BR',short?{month:'short'}:{month:'long',year:'numeric'}).replace('.','');
const dateBR=s=>{const [y,m,d]=s.split('-');return d+'/'+m+'/'+y};
const dateShort=s=>dateBR(s).slice(0,5);
const uid=()=>Math.random().toString(36).slice(2,10);
const daysBetween=(a,b)=>Math.round((parse(a)-parse(b))/86400000);

const ICONS={
home:'<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
more:'<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
eyeoff:'<path d="M3 3l18 18"/><path d="M10.6 6.1A9.6 9.6 0 0112 6c6 0 10 6 10 6a17 17 0 01-3.2 3.9M6.6 7.6A17 17 0 002 12s4 7 10 7c1.6 0 3-.4 4.3-1"/>',
plus:'<path d="M12 5v14M5 12h14"/>',
left:'<path d="M15 6l-6 6 6 6"/>',
right:'<path d="M9 6l6 6-6 6"/>',
send:'<path d="M4 12l16-8-6 16-3-7-7-1z"/>'};
const ic=n=>'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">'+ICONS[n]+'</svg>';

const CAT_D={'Alimentação':'#e07a2f','Moradia':'#3d78e0','Transporte':'#c79a12','Lazer':'#a85cc9','Saúde':'#d6475f','Educação':'#1f958f','Assinaturas':'#6c5ccf','Outros':'#7d8798'};
const CAT_R=['Salário','Freelance','Investimentos','Outras receitas'];
const catColor=c=>CAT_D[c]||'#7d8798';
const METHODS=['PIX','Cartão de débito','Cartão de crédito','Dinheiro','Boleto','Transferência'];
const ACC_TYPES={corrente:'Conta corrente',poupanca:'Poupança',carteira:'Carteira de dinheiro',digital:'Conta de banco digital'};
const REC={unica:'Não repete',semanal:'Toda semana',mensal:'Todo mês',anual:'Todo ano'};

/* ---------- state ---------- */
let S=emptyState();
let currentUser=null;
let saveTimer=null;
let pendingState=null;
let saveQueue=Promise.resolve();
let saveErrorShown=false;
let saveVersion=0;
const ui={view:'inicio',month:mk(TODAY),pt:'despesa',ht:'',hq:'',chat:null,guide:null};

function emptyState(){return {accounts:[],movs:[],sheets:[],settings:{hide:false,currency:'BRL',accent:'azul',theme:'',scale:1,guideSeen:false},v:2}}
function normalizeState(o){
  const base=emptyState();
  if(!o||typeof o!=='object')return base;
  const settings=Object.assign({},base.settings,o.settings||{});
  if(!['azul','verde','roxo','laranja','grafite'].includes(settings.accent))settings.accent='azul';
  return {accounts:(Array.isArray(o.accounts)?o.accounts:[]).filter(a=>!a.demo),movs:(Array.isArray(o.movs)?o.movs:[]).filter(m=>!m.demo),sheets:Array.isArray(o.sheets)?o.sheets:[],settings,v:2};
}
async function apiRequest(url,options){
  const o=options||{};o.credentials='same-origin';o.headers=Object.assign({'Content-Type':'application/json'},o.headers||{});
  const response=await fetch(url,o);let data={};try{data=await response.json()}catch(e){}
  if(!response.ok)throw new Error(data.error||'Não consegui falar com o servidor local.');
  return data;
}
function save(){
  if(!currentUser||!S)return;
  pendingState=JSON.stringify(S);saveVersion++;saveErrorShown=false;clearTimeout(saveTimer);saveTimer=setTimeout(flushSave,250);
}
function flushSave(){
  clearTimeout(saveTimer);if(!currentUser||!pendingState)return saveQueue;
  const snapshot=pendingState,version=saveVersion;pendingState=null;
  saveQueue=saveQueue.then(()=>apiRequest('/api/state',{method:'PUT',body:JSON.stringify({state:JSON.parse(snapshot)})}))
    .catch(error=>{if(version===saveVersion&&!pendingState)pendingState=snapshot;if(!saveErrorShown){saveErrorShown=true;toast(error.message||'Não foi possível salvar agora.');}});
  return saveQueue;
}
function showAuth(mode,message){
  $('#app-shell').hidden=true;$('#auth-root').hidden=false;
  const registering=mode==='register';
  $('#auth-root').innerHTML='<div class="auth-page"><section class="auth-card" aria-labelledby="auth-title"><div class="auth-brand"><i>F</i>Família Próspera</div><h1 id="auth-title">'+(registering?'Crie sua conta':'Entre na sua conta')+'</h1><p class="hint">Seus lançamentos ficam associados ao seu usuário neste servidor.</p><form id="auth-form" class="form" novalidate><div class="field"><label for="auth-email">E-mail</label><input id="auth-email" name="email" type="email" autocomplete="email" maxlength="254" required></div><div class="field"><label for="auth-password">Senha</label><input id="auth-password" name="password" type="password" autocomplete="'+(registering?'new-password':'current-password')+'" minlength="10" maxlength="200" required>'+(registering?'<span class="hint">Use pelo menos 10 caracteres.</span>':'')+'</div>'+(registering?'<div class="field"><label for="auth-confirm">Repita a senha</label><input id="auth-confirm" name="confirm" type="password" autocomplete="new-password" minlength="10" required></div>':'')+'<p id="auth-error" class="auth-error" role="alert">'+esc(message||'')+'</p><button id="auth-submit" class="btn primary" type="submit">'+(registering?'Criar conta':'Entrar')+'</button></form><p style="text-align:center;margin:1rem 0 0">'+(registering?'Já tem conta?':'Ainda não tem conta?')+' <button class="auth-switch" type="button" data-auth-mode="'+(registering?'login':'register')+'">'+(registering?'Entrar':'Criar uma conta')+'</button></p><p class="hint" style="margin-top:1rem">Versão local: o banco de dados fica no computador que executa o servidor.</p></section></div>';
  const email=$('#auth-email');if(email)email.focus();
}
async function enterApp(user){
  currentUser=user;$('#user-email').textContent=user.email;$('#auth-root').hidden=true;$('#app-shell').hidden=false;
  const response=await apiRequest('/api/state');S=normalizeState(response.state);
  ui.view='inicio';render();
  if(!S.settings.guideSeen)startGuide(true);
}
async function initApp(){
  try{
    const session=await apiRequest('/api/auth/me');
    if(session.authenticated)await enterApp(session.user);else showAuth('login');
  }catch(error){showAuth('login','Não foi possível conectar. Inicie o app pelo comando npm start e abra http://127.0.0.1:3000.');}
}
async function logoutUser(){
  await flushSave();
  if(pendingState){toast('Ainda não consegui salvar seus últimos dados. Verifique a conexão e tente sair novamente.');return}
  try{await apiRequest('/api/auth/logout',{method:'POST',body:'{}'})}catch(e){}
  currentUser=null;S=null;pendingState=null;ui.guide=null;ui.chat=null;
  showAuth('login');
}

/* ---------- finance engine ---------- */
const isDone=m=>m.status!=='pendente';
const dueOf=m=>m.due||m.date;
const refOf=m=>isDone(m)?m.date:dueOf(m);
const isOver=m=>!isDone(m)&&dueOf(m)<TODAY;
const sgn=m=>m.type==='receita'?m.value:-m.value;
const sum=(arr,f)=>arr.reduce((t,x)=>t+f(x),0);
const val=m=>m.value;
const accBalance=a=>a.initial+sum(S.movs.filter(m=>m.acc===a.id&&isDone(m)&&m.date>=(a.initialDate||'0000-00-00')),sgn);
const totalBalance=()=>sum(S.accounts,accBalance);
function monthStats(k){
  const ms=S.movs.filter(m=>mk(refOf(m))===k);
  const inc=ms.filter(m=>m.type==='receita'), exp=ms.filter(m=>m.type==='despesa');
  const r={inc:sum(inc,val),exp:sum(exp,val),incDone:sum(inc.filter(isDone),val),expDone:sum(exp.filter(isDone),val)};
  r.result=r.inc-r.exp;r.saving=r.inc>0?r.result/r.inc*100:null;return r;
}
function forecast(k){
  const end=k+'-31';
  return totalBalance()+sum(S.movs.filter(m=>!isDone(m)&&refOf(m)<=end),sgn);
}
function catTotals(k){
  const o={};S.movs.filter(m=>m.type==='despesa'&&mk(refOf(m))===k).forEach(m=>{o[m.cat]=(o[m.cat]||0)+m.value});return o;
}
function defAcc(){
  return S.accounts[0]?S.accounts[0].id:'';
}
function requireAccount(){
  if(S.accounts.length)return true;
  confirmBox('Cadastre uma conta para começar','Informe o saldo inicial real de uma conta sua. Depois você poderá anotar receitas e despesas nela.','Cadastrar conta',()=>accForm());
  return false;
}
function markDone(id){
  const m=S.movs.find(x=>x.id===id);if(!m)return;
  const base=dueOf(m);
  m.status=m.type==='receita'?'recebido':'pago';
  m.date=TODAY;
  if(m.rec&&m.rec!=='unica'){
    const next=m.rec==='semanal'?addDays(base,7):addMonths(base,m.rec==='mensal'?1:12);
    const exists=S.movs.some(x=>x.desc===m.desc&&x.type===m.type&&x.acc===m.acc&&!isDone(x)&&dueOf(x)===next);
    if(!exists)S.movs.push(Object.assign({},m,{id:uid(),status:'pendente',date:next,due:next}));
  }
  save();render();
  toast(m.type==='receita'?'Anotado como recebido. Seu saldo foi atualizado.':'Anotado como pago. Seu saldo foi atualizado.');
}

/* ---------- formatting ---------- */
let nf=null;
const fmtNum=n=>{const c=S.settings.currency;if(!nf||nf.c!==c)nf={c,f:new Intl.NumberFormat('pt-BR',{style:'currency',currency:c})};return nf.f.format(n)};
const money=n=>S.settings.hide?'••••••':fmtNum(n);
const moneyEl=n=>'<span class="num mask">'+fmtNum(n)+'</span>';
const initials=s=>s.trim().slice(0,2).toUpperCase();
function whenText(m){
  const d=daysBetween(dueOf(m),TODAY);
  if(d<0)return 'Venceu há '+(-d)+(d===-1?' dia':' dias')+' ('+dateShort(dueOf(m))+')';
  if(d===0)return 'Vence hoje';
  if(d===1)return 'Vence amanhã ('+dateShort(dueOf(m))+')';
  return 'Vence em '+d+' dias ('+dateShort(dueOf(m))+')';
}

/* ---------- toast / modal ---------- */
let tt=null;
function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(tt);tt=setTimeout(()=>{t.hidden=true},3800)}
function openModal(html,onMount){
  const r=$('#modalroot');
  r.innerHTML='<div class="overlay" data-a="overlay"><div class="modal" role="dialog" aria-modal="true">'+html+'</div></div>';
  const first=r.querySelector('input.money,input:not([type=hidden]),select');if(first)first.focus();
  if(onMount)onMount(r);
}
function closeModal(){$('#modalroot').innerHTML=''}
function confirmBox(title,text,okLabel,fn){
  openModal('<h2>'+esc(title)+'</h2><p style="margin:0">'+esc(text)+'</p><div class="mfoot"><button class="btn" data-a="closeModal">Voltar</button><button class="btn primary" id="okc">'+esc(okLabel)+'</button></div>',r=>{
    r.querySelector('#okc').addEventListener('click',()=>{closeModal();fn()});
  });
}
function parseMoney(raw){
  raw=String(raw).replace(/r\$/i,'').trim();if(!raw)return NaN;
  if(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw))raw=raw.replace(/\./g,'').replace(',','.');else raw=raw.replace(',','.');
  return parseFloat(raw);
}

/* ---------- plain-language entry ---------- */
const norm=s=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const INC_W=['recebi','ganhei','entrou','salario','deposit','vendi','pagaram','recebimento','vou receber','a receber'];
const CATMAP=[['Alimentação',['mercado','supermercado','padaria','comida','restaurante','lanche','ifood','almoco','jantar','cafe','acougue','feira','pizza','hamburguer']],
 ['Moradia',['aluguel','condominio','luz','agua','internet','gas','energia','iptu','telefone']],
 ['Transporte',['uber','onibus','metro','gasolina','combustivel','passagem','estacionamento','pedagio']],
 ['Saúde',['farmacia','remedio','medico','consulta','dentista','exame','plano de saude']],
 ['Lazer',['cinema','bar','festa','viagem','show','passeio','jogo']],
 ['Educação',['curso','escola','faculdade','livro','mensalidade']],
 ['Assinaturas',['netflix','spotify','assinatura','streaming','prime','disney']]];
const INCMAP=[['Salário',['salario']],['Freelance',['freela','freelance','servico','projeto']],['Investimentos',['rendimento','dividendo','juros']]];
function understand(text){
  const n=norm(text);
  const m=text.match(/(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/);
  if(!m)return null;
  const value=parseMoney(m[1]);if(!(value>0))return null;
  const isInc=INC_W.some(w=>n.includes(w));
  const type=isInc?'receita':'despesa';
  let cat=type==='receita'?'Outras receitas':'Outros';
  const maps=type==='receita'?INCMAP:CATMAP;
  for(const [c,ks] of maps){if(ks.some(k=>new RegExp('\\b'+k).test(n))){cat=c;break}}
  const pending=/\b(vence|vou pagar|tenho que pagar|preciso pagar|a pagar|ainda nao paguei|vou receber|a receber)/.test(n);
  let date=TODAY,due='';
  if(pending){
    if(/amanha/.test(n))due=addDays(TODAY,1);
    else if(/hoje/.test(n))due=TODAY;
    const dm=n.match(/dia (\d{1,2})/);
    if(dm){const dd=Math.min(31,Number(dm[1])),year=Number(TODAY.slice(0,4)),month=Number(TODAY.slice(5,7));let c=iso(new Date(year,month-1,Math.min(dd,new Date(year,month,0).getDate())));if(c<TODAY){const next=shiftMonth(mk(TODAY),1),ny=Number(next.slice(0,4)),nmth=Number(next.slice(5,7));c=next+'-'+pad(Math.min(dd,new Date(ny,nmth,0).getDate()))}due=c}
    if(!due)return null;
    date=due;
  }else if(/ontem/.test(n))date=addDays(TODAY,-1);
  let desc=text.replace(m[1],'').replace(/r\$\s*/ig,'').replace(/\breais\b/ig,'').replace(/\s+/g,' ').trim();
  if(!desc)desc=cat;
  desc=desc.charAt(0).toUpperCase()+desc.slice(1);
  if(desc.length>60)desc=desc.slice(0,60);
  return {desc,value,type,cat,date,due,status:pending?'pendente':(type==='receita'?'recebido':'pago'),method:'PIX',rec:'unica',notes:''};
}
function describe(o){
  const kind=o.type==='receita'?'uma entrada de dinheiro':'um gasto';
  const st=o.status==='pendente'?('ainda não '+(o.type==='receita'?'recebido':'pago')+', com vencimento em '+dateBR(o.due)):(o.type==='receita'?'já recebido':'já pago')+(o.date===TODAY?' hoje':' em '+dateBR(o.date));
  return 'Entendi assim: '+kind+' de <b>'+esc(fmtNum(o.value))+'</b> em <b>'+esc(o.cat)+'</b>, '+st+'.';
}

/* ---------- forms ---------- */
function movForm(m,preset){
  const e=m||Object.assign({type:'despesa',desc:'',value:'',cat:'',date:TODAY,due:'',method:'PIX',status:'pago',rec:'unica',notes:'',acc:''},preset||{});
  if(!e.cat)e.cat=e.type==='receita'?CAT_R[0]:'Alimentação';
  const acc=e.acc||(S.accounts[0]&&S.accounts[0].id)||'';
  const done=e.status!=='pendente';
  const dueVal=e.due||(done?addDays(TODAY,7):dueOf(e));
  const cats=t=>(t==='receita'?CAT_R:Object.keys(CAT_D)).map(c=>'<option'+(c===e.cat?' selected':'')+'>'+esc(c)+'</option>').join('');
  const verb=t=>t==='receita'?'recebi':'paguei';
  openModal('<h2>'+(m?'Corrigir lançamento':'Novo lançamento')+'</h2><form id="mf" class="form" novalidate>'+
   '<div class="field"><span class="l">O que é?</span><div class="seg" id="s-type"><button type="button" data-v="despesa" aria-pressed="'+(e.type==='despesa')+'">Gastei</button><button type="button" data-v="receita" aria-pressed="'+(e.type==='receita')+'">Recebi</button></div></div>'+
   '<div class="field"><label for="f-desc">Descrição</label><input id="f-desc" name="desc" value="'+esc(e.desc)+'" maxlength="80" placeholder="Ex.: Supermercado"></div>'+
   '<div class="field"><label for="f-val">Quanto? (em reais)</label><input id="f-val" class="money" name="value" inputmode="decimal" value="'+esc(e.value===''?'':String(e.value).replace('.',','))+'" placeholder="0,00"></div>'+
   '<div class="field"><label for="f-cat">Categoria</label><select id="f-cat" name="cat">'+cats(e.type)+'</select></div>'+
   '<div class="field"><span class="l" id="l-paid">Já '+verb(e.type)+'?</span><div class="seg" id="s-paid"><button type="button" data-v="done" aria-pressed="'+done+'">Sim</button><button type="button" data-v="pendente" aria-pressed="'+!done+'">Ainda não</button></div></div>'+
   '<div class="field" id="w-date"'+(done?'':' hidden')+'><label for="f-date">Em que dia?</label><input id="f-date" type="date" name="date" value="'+(done?e.date:TODAY)+'"><div class="datebtns"><button type="button" class="btn sm" data-d="0">Hoje</button><button type="button" class="btn sm" data-d="-1">Ontem</button></div></div>'+
   '<div class="field" id="w-due"'+(done?' hidden':'')+'><label for="f-due">Vence em que dia?</label><input id="f-due" type="date" name="due" value="'+dueVal+'"></div>'+
   '<details class="more"><summary>Mais opções</summary><div class="form">'+
   '<div class="field"><label for="f-acc">De qual conta?</label><select id="f-acc" name="acc">'+S.accounts.map(a=>'<option value="'+a.id+'"'+(a.id===acc?' selected':'')+'>'+esc(a.name)+'</option>').join('')+'</select></div>'+ 
   '<div class="field"><label for="f-method">Forma de pagamento</label><select id="f-method" name="method">'+METHODS.map(x=>'<option'+(x===e.method?' selected':'')+'>'+x+'</option>').join('')+'</select></div>'+
   '<div class="field"><label for="f-rec">Repete?</label><select id="f-rec" name="rec">'+Object.keys(REC).map(k=>'<option value="'+k+'"'+(k===e.rec?' selected':'')+'>'+REC[k]+'</option>').join('')+'</select></div>'+
   '<div class="field"><label for="f-notes">Observações</label><textarea id="f-notes" name="notes" rows="2" maxlength="300">'+esc(e.notes)+'</textarea></div></div></details>'+
   '<div class="err" id="ferr" role="alert"></div></form>'+
   '<div class="mfoot"><button class="btn" data-a="closeModal">Cancelar</button><button class="btn primary" id="msave">Salvar</button></div>',r=>{
    const form=r.querySelector('#mf');let type=e.type,paid=done?'done':'pendente';
    const pressed=(box,v)=>box.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===v)));
    r.querySelector('#s-type').addEventListener('click',ev=>{const b=ev.target.closest('button');if(!b)return;type=b.dataset.v;e.cat=type==='receita'?CAT_R[0]:'Alimentação';pressed(r.querySelector('#s-type'),type);form.cat.innerHTML=cats(type);r.querySelector('#l-paid').textContent='Já '+verb(type)+'?'});
    r.querySelector('#s-paid').addEventListener('click',ev=>{const b=ev.target.closest('button');if(!b)return;paid=b.dataset.v;pressed(r.querySelector('#s-paid'),paid);r.querySelector('#w-date').hidden=paid!=='done';r.querySelector('#w-due').hidden=paid==='done'});
    r.querySelectorAll('[data-d]').forEach(b=>b.addEventListener('click',()=>{form.date.value=addDays(TODAY,Number(b.dataset.d))}));
    const submit=ev=>{
      if(ev)ev.preventDefault();
      const err=r.querySelector('#ferr'),v=parseMoney(form.value.value);
      if(!form.desc.value.trim()){err.textContent='Escreva o que foi. Exemplo: Supermercado.';form.desc.focus();return}
      if(!(v>0)){err.textContent='Escreva um valor maior que zero. Use vírgula para os centavos. Exemplo: 45,90.';form.value.focus();return}
      const isDoneNow=paid==='done';
      if(isDoneNow&&!form.date.value){err.textContent='Escolha o dia.';return}
      if(!isDoneNow&&!form.due.value){err.textContent='Escolha o dia do vencimento.';return}
      if(!form.acc.value){err.textContent='Cadastre uma conta antes de salvar este lançamento.';return}
      const o={desc:form.desc.value.trim(),value:Math.round(v*100)/100,type,cat:form.cat.value,acc:form.acc.value,method:form.method.value,
        date:isDoneNow?form.date.value:form.due.value,due:isDoneNow?'':form.due.value,status:isDoneNow?(type==='receita'?'recebido':'pago'):'pendente',rec:form.rec.value,notes:form.notes.value.trim()};
      if(m)Object.assign(m,o);else S.movs.push(Object.assign({id:uid()},o));
      save();closeModal();render();toast(m?'Lançamento corrigido.':'Lançamento anotado.');
    };
    form.addEventListener('submit',submit);r.querySelector('#msave').addEventListener('click',submit);
  });
}
function accForm(a){
  const e=a||{name:'',type:'corrente',initial:0,initialDate:TODAY};
  openModal('<h2>'+(a?'Corrigir conta':'Nova conta')+'</h2><form id="af" class="form" novalidate>'+
   '<div class="field"><label for="a-name">Nome da conta</label><input id="a-name" name="name" value="'+esc(e.name)+'" maxlength="40" placeholder="Ex.: Banco digital"></div>'+
   '<div class="field"><label for="a-type">Tipo</label><select id="a-type" name="type">'+Object.keys(ACC_TYPES).map(k=>'<option value="'+k+'"'+(k===e.type?' selected':'')+'>'+ACC_TYPES[k]+'</option>').join('')+'</select></div>'+
   '<div class="field"><label for="a-ini">Saldo da conta nessa data</label><input id="a-ini" class="money" name="initial" inputmode="decimal" value="'+String(e.initial).replace('.',',')+'"></div>'+ 
   '<div class="field"><label for="a-date">Data do saldo inicial</label><input id="a-date" name="initialDate" type="date" max="'+TODAY+'" value="'+esc(e.initialDate||TODAY)+'" required><span class="hint">Movimentações anteriores a esta data não alteram o saldo atual.</span></div>'+ 
   '<div class="err" id="aerr" role="alert"></div></form><div class="mfoot"><button class="btn" data-a="closeModal">Cancelar</button><button class="btn primary" id="asave">Salvar</button></div>',r=>{
    const form=r.querySelector('#af');
    const submit=ev=>{
      if(ev)ev.preventDefault();
      const v=String(form.initial.value).trim()?parseMoney(form.initial.value):0;
      if(!form.name.value.trim()){r.querySelector('#aerr').textContent='Escreva o nome da conta.';return}
      if(isNaN(v)){r.querySelector('#aerr').textContent='O valor precisa ser um número. Exemplo: 1500,00.';return}
      if(!form.initialDate.value||form.initialDate.value>TODAY){r.querySelector('#aerr').textContent='Escolha uma data de saldo inicial que já tenha ocorrido.';return}
      const o={name:form.name.value.trim(),type:form.type.value,initial:Math.round(v*100)/100,initialDate:form.initialDate.value};
      if(a)Object.assign(a,o);else S.accounts.push(Object.assign({id:uid()},o));
      save();closeModal();render();toast('Conta salva.');
    };
    form.addEventListener('submit',submit);r.querySelector('#asave').addEventListener('click',submit);
  });
}

/* ---------- list items ---------- */
function itemCard(m,mode){
  const over=isOver(m);
  const sign=(m.type==='receita'?'+ ':'− ');
  const meta=isDone(m)?esc(m.cat)+' · '+dateBR(m.date):'<span class="'+(over?'neg':'')+'" style="font-weight:700">'+whenText(m)+'</span> · '+esc(m.cat);
  let acts='';
  if(!isDone(m))acts+='<button class="btn good sm" data-a="done" data-id="'+m.id+'">'+(m.type==='receita'?'Já recebi':'Já paguei')+'</button>';
  else if(mode==='hist')acts+='<button class="btn sm" data-a="reopen" data-id="'+m.id+'">Desfazer pagamento</button>';
  acts+='<button class="btn sm" data-a="editMov" data-id="'+m.id+'">Corrigir</button>';
  if(mode==='hist'||mode==='pay')acts+='<button class="btn sm danger" data-a="delMov" data-id="'+m.id+'">Excluir</button>';
  return '<div class="item'+(over?' late':'')+'"><div class="line"><div class="t"><b>'+esc(m.desc)+'</b><span class="hint">'+meta+'</span></div><div class="amt num mask '+(m.type==='receita'?'pos':'')+'">'+sign+fmtNum(m.value)+'</div></div><div class="acts">'+acts+'</div></div>';
}

/* ---------- views ---------- */
function viewInicio(){
  const k=mk(TODAY), st=monthStats(k);
  const pend=S.movs.filter(m=>!isDone(m)), overs=pend.filter(isOver);
  const fc=forecast(k);
  let tone='ok',title='Está tudo certo este mês',text='Se você pagar tudo que está previsto, vão sobrar <b class="num mask">'+fmtNum(fc)+'</b> no fim do mês.';
  if(fc<0){tone='bad';title='Cuidado: o dinheiro pode não chegar';text='Pelas contas previstas, vão faltar <b class="num mask">'+fmtNum(-fc)+'</b> até o fim do mês.'}
  else if(overs.length){tone='warn';title='Você tem '+overs.length+(overs.length===1?' conta vencida':' contas vencidas');text='Pague assim que puder. Elas somam <b class="num mask">'+fmtNum(sum(overs,val))+'</b>.'}
  let html='<div class="hero"><div class="lbl">Dinheiro que você tem agora</div><div class="big num mask">'+fmtNum(totalBalance())+'</div></div>';
  if(!S.accounts.length)html+='<div class="status warn" role="status"><h2>Adicione sua conta e seu saldo inicial</h2><p>O painel ainda não tem seus dados. Ele só fará os cálculos depois que você informar uma conta e registrar suas movimentações.</p></div>';
  else if(!S.movs.length)html+='<div class="status ok" role="status"><h2>Saldo inicial salvo</h2><p>O valor exibido vem da conta que você cadastrou. Registre movimentações para ver previsões e análises.</p></div>';
  else html+='<div class="status '+tone+'" role="status"><h2>'+title+'</h2><p>'+text+'</p></div>';
  // chat
  let chat='';
  if(ui.chat){
    chat+='<div class="bubble me">'+esc(ui.chat.user)+'</div>';
    if(ui.chat.kind==='error')chat+='<div class="bubble bot">Não entendi todos os dados. Escreva <b>gastei 45,90 no mercado</b> ou <b>recebi 1200 de salário</b>. Para um compromisso futuro, informe também o vencimento: <b>vou pagar 120 de luz dia 20</b>.</div>';
    if(ui.chat.kind==='confirm')chat+='<div class="bubble bot">'+describe(ui.chat.mov)+'<div class="row2" style="margin-top:.7rem"><button class="btn primary sm" data-a="chatSave">Está certo, salvar</button><button class="btn sm" data-a="chatFix">Corrigir</button></div></div>';
    if(ui.chat.kind==='saved')chat+='<div class="bubble bot">Pronto, anotei! Agora você tem <b class="num mask">'+fmtNum(totalBalance())+'</b> disponíveis.</div>';
  }
  html+='<div class="card chat"><h2 style="margin:0">Conte o que aconteceu</h2><p class="hint" style="margin:0">Escreva como se estivesse falando. O app entende e anota para você.</p>'+chat+
   '<form id="chatform"><input id="chatin" aria-label="Escreva o que aconteceu" placeholder="Ex.: gastei 45 no mercado" autocomplete="off"><button class="btn primary" type="submit">'+ic('send')+'Enviar</button></form>'+
   '<div class="row2"><button class="btn big" data-a="quick" data-t="despesa">Gastei dinheiro</button><button class="btn big" data-a="quick" data-t="receita">Recebi dinheiro</button></div></div>';
  if(!S.movs.length){
    html+='<div class="card"><h2>Como começar</h2>'+(S.accounts.length?'<p style="margin:0 0 .6rem">Sua conta já está cadastrada. Anote uma entrada ou despesa sua usando o campo acima ou os botões rápidos.</p>':'<p style="margin:0 0 .8rem">Primeiro cadastre uma conta e informe o saldo que ela tem agora. Depois anote as entradas e despesas reais.</p><button class="btn primary" data-a="newAcc">Cadastrar minha conta</button>')+'</div>';
    return html;
  }
  const up=pend.slice().sort((a,b)=>dueOf(a).localeCompare(dueOf(b))).slice(0,4);
  html+='<div class="card"><h2>Para pagar ou receber logo</h2>'+(up.length?'<div class="list">'+up.map(m=>itemCard(m,'home')).join('')+'</div>':'<div class="empty"><b>Nada pendente</b><span>Você está com tudo em dia.</span></div>')+
    (pend.length>4?'<div style="margin-top:.8rem"><button class="btn" style="width:100%" data-a="go" data-v="pagar">Ver todas ('+pend.length+')</button></div>':'')+'</div>';
  const ct=catTotals(k),keys=Object.keys(ct).sort((a,b)=>ct[b]-ct[a]).slice(0,5),tot=sum(Object.keys(ct),c=>ct[c]);
  html+='<div class="card"><h2>Para onde foi seu dinheiro em '+esc(monthLabel(k,true))+'</h2>'+(keys.length?'<div class="bars">'+keys.map(c=>'<div class="bar"><div class="h"><span>'+esc(c)+'</span><b class="num mask">'+fmtNum(ct[c])+' · '+Math.round(ct[c]/tot*100)+'%</b></div><div class="track"><div class="fill" style="width:'+Math.max(3,ct[c]/tot*100)+'%;background:'+catColor(c)+'"></div></div></div>').join('')+'</div>':'<div class="empty">Ainda não há gastos neste mês.</div>')+'</div>';
  // tips
  const cp=catTotals(shiftMonth(k,-1)),tips=[];
  Object.keys(ct).forEach(c=>{const a=ct[c],b=cp[c]||0;if(b>0&&a>b*1.15&&a-b>=30)tips.push({t:'neg',x:'Você gastou '+Math.round((a-b)/b*100)+'% a mais com '+c.toLowerCase()+' do que no mês passado ('+money(b)+' para '+money(a)+').',d:(a-b)/b})});
  tips.sort((x,y)=>y.d-x.d);
  const out=tips.slice(0,2);
  const subs=S.movs.filter(m=>m.type==='despesa'&&m.cat==='Assinaturas'&&mk(refOf(m))===k);
  if(subs.length)out.push({t:'warn',x:'Você paga '+money(sum(subs,val))+' por mês em assinaturas. Vale conferir se usa todas.'});
  if(st.saving!=null&&st.saving>=10)out.push({t:'pos',x:'Você está guardando '+Math.round(st.saving)+'% do que ganha neste mês. Muito bom!'});
  html+='<div class="card"><h2>Avisos para você</h2>'+(out.length?out.map(i=>'<div class="tip"><i style="background:var(--'+(i.t==='neg'?'neg':i.t==='warn'?'warn':'pos')+')"></i><span>'+esc(i.x)+'</span></div>').join(''):'<p class="hint">Continue anotando seus gastos. Quanto mais lançamentos, mais avisos úteis você recebe.</p>')+'</div>';
  return html;
}
function viewPagar(){
  const t=ui.pt;
  const all=S.movs.filter(m=>!isDone(m));
  const mine=all.filter(m=>m.type===t).sort((a,b)=>dueOf(a).localeCompare(dueOf(b)));
  const nD=all.filter(m=>m.type==='despesa').length,nR=all.length-nD;
  const late=mine.filter(isOver),soon=mine.filter(m=>!isOver(m)&&dueOf(m)<=addDays(TODAY,7)),later=mine.filter(m=>dueOf(m)>addDays(TODAY,7));
  const grp=(title,arr,cls)=>arr.length?'<div class="card"><h2 class="'+(cls||'')+'">'+title+' ('+arr.length+')</h2><div class="list">'+arr.map(m=>itemCard(m,'pay')).join('')+'</div></div>':'';
  let html='<div class="seg" id="pt"><button data-a="ptype" data-v="despesa" aria-pressed="'+(t==='despesa')+'">A pagar ('+nD+')</button><button data-a="ptype" data-v="receita" aria-pressed="'+(t==='receita')+'">A receber ('+nR+')</button></div>';
  html+='<button class="btn primary big" data-a="newPend">'+ic('plus')+(t==='despesa'?'Anotar uma conta a pagar':'Anotar um valor a receber')+'</button>';
  html+=grp('Atrasadas',late,'neg')+grp('Nos próximos 7 dias',soon)+grp('Mais para frente',later);
  if(!mine.length)html+='<div class="card empty"><b>'+(t==='despesa'?'Nenhuma conta a pagar':'Nada a receber')+'</b><span>'+(t==='despesa'?'Tudo em dia!':'Quando alguém ficar de lhe pagar, anote aqui.')+'</span></div>';
  return html;
}
function histList(){
  const q=norm(ui.hq.trim());
  const rows=S.movs.filter(m=>{
    if(!q&&mk(refOf(m))!==ui.month)return false;
    if(ui.ht&&m.type!==ui.ht)return false;
    if(q&&!norm(m.desc+' '+m.cat+' '+m.notes).includes(q))return false;
    return true;
  }).sort((a,b)=>refOf(b).localeCompare(refOf(a)));
  if(!rows.length)return '<div class="empty"><b>'+(q?'Nada encontrado':'Nada neste mês')+'</b><span>'+(q?'Tente outra palavra.':'Use o botão abaixo para anotar.')+'</span></div>';
  return '<div class="list">'+rows.map(m=>itemCard(m,'hist')).join('')+'</div>';
}
function viewHist(){
  const st=monthStats(ui.month);
  const pendPay=sum(S.movs.filter(m=>!isDone(m)&&m.type==='despesa'&&mk(refOf(m))===ui.month),val),pendRec=sum(S.movs.filter(m=>!isDone(m)&&m.type==='receita'&&mk(refOf(m))===ui.month),val);
  return '<div class="card"><div class="monthbar"><button class="btn icon" data-a="prevMonth" aria-label="Mês anterior">'+ic('left')+'</button><strong>'+esc(monthLabel(ui.month))+'</strong><button class="btn icon" data-a="nextMonth" aria-label="Próximo mês">'+ic('right')+'</button></div>'+
   '<div class="sum" style="margin-top:.9rem"><div><small>Entrou</small><b class="pos num mask">'+fmtNum(st.incDone)+'</b></div><div><small>Saiu</small><b class="neg num mask">'+fmtNum(st.expDone)+'</b></div><div><small>Sobrou</small><b class="num mask '+(st.incDone-st.expDone<0?'neg':'')+'">'+fmtNum(st.incDone-st.expDone)+'</b></div></div>'+
   '<p class="hint" style="margin-top:.7rem">Ainda a pagar neste mês: <b class="num mask">'+fmtNum(pendPay)+'</b> · a receber: <b class="num mask">'+fmtNum(pendRec)+'</b></p></div>'+
   '<div class="seg three" id="ht"><button data-a="htype" data-v="" aria-pressed="'+(ui.ht==='')+'">Tudo</button><button data-a="htype" data-v="despesa" aria-pressed="'+(ui.ht==='despesa')+'">Gastos</button><button data-a="htype" data-v="receita" aria-pressed="'+(ui.ht==='receita')+'">Entradas</button></div>'+
   '<div class="field"><label for="hq" style="position:absolute;left:-9999px">Buscar</label><input id="hq" type="search" placeholder="Buscar por nome ou categoria" value="'+esc(ui.hq)+'" style="padding:.8rem 1rem;border-radius:.9rem;border:2px solid var(--line);background:var(--surface);min-height:3.25rem;width:100%"></div>'+
   '<div id="hlist">'+histList()+'</div>'+
   '<button class="btn primary big" data-a="newMov">'+ic('plus')+'Anotar gasto ou entrada</button>';
}
function viewMais(){
  const acc=[['azul','#1f5fd1','Azul'],['verde','#0d7556','Verde'],['roxo','#6a33c2','Roxo'],['laranja','#c24a08','Laranja'],['grafite','#2f3541','Grafite']];
  const sc=S.settings.scale||1;
  return '<div class="card"><h2>Minhas contas</h2>'+
   (S.accounts.length?'<div class="list">'+S.accounts.map(a=>'<div class="item acc"><div class="line"><div class="t"><b>'+esc(a.name)+'</b><span class="hint">'+ACC_TYPES[a.type]+'</span></div><div class="val num mask '+(accBalance(a)<0?'neg':'')+'">'+fmtNum(accBalance(a))+'</div></div><div class="acts"><button class="btn sm" data-a="editAcc" data-id="'+a.id+'">Corrigir</button><button class="btn sm danger" data-a="delAcc" data-id="'+a.id+'">Excluir</button></div></div>').join('')+'</div>':'<p class="hint">Você ainda não cadastrou uma conta. Informe o saldo inicial real para começar.</p>')+
   '<div style="margin-top:.8rem"><button class="btn" style="width:100%" data-a="newAcc">'+ic('plus')+'Adicionar conta</button></div></div>'+
   '<div class="card"><h2>Deixar mais fácil de ler</h2>'+
   '<div class="setrow"><b>Tamanho das letras</b><div class="seg three"><button data-a="scale" data-v="1" aria-pressed="'+(sc===1)+'">Normal</button><button data-a="scale" data-v="1.18" aria-pressed="'+(sc===1.18)+'">Grande</button><button data-a="scale" data-v="1.36" aria-pressed="'+(sc===1.36)+'">Maior</button></div></div>'+
   '<div class="setrow"><b>Tema</b><div class="seg"><button data-a="theme" data-v="light" aria-pressed="'+(curTheme()==='light')+'">Claro</button><button data-a="theme" data-v="dark" aria-pressed="'+(curTheme()==='dark')+'">Escuro</button></div></div>'+
   '<div class="setrow"><b>Cor do aplicativo</b><div class="opts">'+acc.map(a=>'<button class="swatch" style="background:'+a[1]+'" data-a="accent" data-v="'+a[0]+'" aria-pressed="'+(S.settings.accent===a[0])+'" aria-label="'+a[2]+'"></button>').join('')+'</div></div>'+
   '<div class="setrow"><b>Esconder valores</b><p class="hint" style="margin:0">Borra os valores na tela. Bom para usar perto de outras pessoas.</p><button class="btn" data-a="toggleHide">'+(S.settings.hide?'Mostrar valores':'Esconder valores')+'</button></div></div>'+
   '<div class="card"><h2>Seus dados</h2>'+ 
   '<div class="setrow"><b>Cópia de segurança</b><p class="hint" style="margin:0">Copia suas contas, lançamentos, configurações e planilhas para guardar.</p><button class="btn" data-a="backup">Copiar meus dados</button></div>'+ 
   '<div class="setrow"><b>Guia passo a passo</b><p class="hint" style="margin:0">O assistente mostra para que serve cada área.</p><button class="btn" data-a="startGuide">Abrir o guia</button></div>'+ 
   '<div class="setrow"><b>Apagar meus dados</b><p class="hint" style="margin:0">Remove contas, lançamentos e planilhas deste usuário. Não dá para desfazer.</p><button class="btn danger" data-a="wipe">Apagar meus dados</button></div></div>'+ 
   '<p class="hint">Seus dados são salvos no banco local deste servidor e separados por conta de usuário.</p>';
}
const VIEWS={inicio:['Início',viewInicio],pagar:['Contas a pagar e receber',viewPagar],hist:['Histórico',viewHist],planilhas:['Planilhas',viewPlanilhas],mais:['Mais opções',viewMais]};
const NAV=[['inicio','Início','home'],['pagar','A pagar','calendar'],['hist','Histórico','list'],['planilhas','Planilhas','grid'],['mais','Mais','more']];
const curTheme=()=>{const r=document.documentElement;return r.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')};

/* ===== PLANILHAS: motor ===== */
const colName=c=>{let s='';c++;while(c>0){const m=(c-1)%26;s=String.fromCharCode(65+m)+s;c=Math.floor((c-1)/26)}return s};
const colIdx=s=>{let n=0;for(const ch of s.toUpperCase())n=n*26+ch.charCodeAt(0)-64;return n-1};
const nm=a=>colName(a[0])+(a[1]+1);
const refRC=ref=>{const m=/^([A-Za-z]{1,3})(\d+)$/.exec(ref);return m?[colIdx(m[1]),Number(m[2])-1]:null};
const REFRE=/\b([A-Za-z]{1,3})(\d+)(?::([A-Za-z]{1,3})(\d+))?\b/g;
const nfAuto=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:4});
const nfNum=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:2});
const nfPct=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});

function toNum(raw){
  let s=String(raw).trim();if(!s)return null;
  let pct=false;if(s.endsWith('%')){pct=true;s=s.slice(0,-1).trim()}
  s=s.replace(/^(-?)\s*R\$\s*/i,'$1');
  if(/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s))s=s.replace(/\./g,'').replace(',','.');
  else if(/^-?\d+(,\d+)?$/.test(s))s=s.replace(',','.');
  else if(!/^-?\d+(\.\d+)?$/.test(s))return null;
  const n=parseFloat(s);return pct?n/100:n;
}
function fmtVal(val,f){
  if(val&&val.err)return val.err;
  if(val===''||val==null)return '';
  if(typeof val==='number'){
    if(f==='money')return fmtNum(val);
    if(f==='percent')return nfPct.format(val*100)+'%';
    if(f==='number')return nfNum.format(val);
    if(f==='text')return String(val).replace('.',',');
    return nfAuto.format(val);
  }
  const s=String(val);
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return dateBR(s);
  return s;
}
function dateKey(s){
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  return m?m[3]+'-'+pad(+m[2])+'-'+pad(+m[1]):null;
}
function tok(s){
  const re=/\s*(?:(\d+(?:\.\d+)?)|"([^"]*)"|([A-Za-z]{1,3}\d+):([A-Za-z]{1,3}\d+)|([A-Za-z]{1,3}\d+)(?![A-Za-z0-9(.])|([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.]*)\(|(<=|>=|<>|[-+*\/^(),;<>=%]))/y;
  const out=[];let p=0;
  while(p<s.length){
    re.lastIndex=p;const m=re.exec(s);
    if(!m){if(/^\s*$/.test(s.slice(p)))break;throw new Error('#ERRO')}
    p=re.lastIndex;
    if(m[1]!==undefined)out.push({t:'n',v:parseFloat(m[1])});
    else if(m[2]!==undefined)out.push({t:'s',v:m[2]});
    else if(m[3]!==undefined)out.push({t:'rng',a:m[3],b:m[4]});
    else if(m[5]!==undefined)out.push({t:'ref',v:m[5]});
    else if(m[6]!==undefined)out.push({t:'fn',v:m[6]});
    else out.push({t:'op',v:m[7]});
  }
  return out;
}
function evalSheet(sh){
  const cache=new Map(),stack=new Set();
  const asNum=x=>{if(x&&x.err)throw new Error(x.err);if(x===''||x==null)return 0;if(typeof x==='number')return x;const n=toNum(String(x));if(n===null)throw new Error('#VALOR');return n};
  function calc(src){
    if(src.indexOf('#REF!')>=0)throw new Error('#REF!');
    const T=tok(src);let i=0;
    if(!T.length)return '';
    const isOp=v=>T[i]&&T[i].t==='op'&&T[i].v===v;
    const expand=(a,b)=>{const A=refRC(a),B=refRC(b);if(!A||!B)throw new Error('#REF!');const o=[];
      for(let r=Math.min(A[1],B[1]);r<=Math.max(A[1],B[1]);r++)for(let c=Math.min(A[0],B[0]);c<=Math.max(A[0],B[0]);c++){if(o.length>10000)throw new Error('#ERRO');o.push(get(nm([c,r])))}
      return o};
    function args(){
      const out=[];if(isOp(')')){i++;return out}
      while(true){
        if(T[i]&&T[i].t==='rng'){const r=T[i++];out.push({range:expand(r.a,r.b)})}else out.push(cmp());
        if(isOp(',')||isOp(';')){i++;continue}
        if(isOp(')')){i++;break}
        throw new Error('#ERRO');
      }
      return out;
    }
    function skipExpr(){
      let depth=0;
      while(i<T.length){
        const t=T[i];
        if(t.t==='op'){
          if(t.v==='('){depth++;i++;continue}
          if(t.v===')'){if(depth===0)return;depth--;i++;continue}
          if((t.v===','||t.v===';')&&depth===0)return;
        }
        i++;
      }
    }
    function callIf(){
      if(!isOp('('))throw new Error('#ERRO');
      i++;
      const condition=cmp();
      const truth=typeof condition==='number'?condition!==0:(condition!==''&&condition!=null);
      if(!isOp(',')&&!isOp(';'))throw new Error('#ERRO');
      i++;
      let yes='';
      if(truth)yes=cmp();else skipExpr();
      if(isOp(',')||isOp(';')){
        i++;
        let no=0;
        if(truth)skipExpr();else no=cmp();
        if(!isOp(')'))throw new Error('#ERRO');
        i++;
        return truth?yes:no;
      }
      if(!isOp(')'))throw new Error('#ERRO');
      i++;
      return truth?yes:0;
    }
    function call(name){
      const key=name.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
      if(key==='IF'||key==='SE')return callIf();
      const a=args();
      const nums=()=>{const o=[];a.forEach(x=>{if(x&&x.range){x.range.forEach(v=>{if(v&&v.err)throw new Error(v.err);if(typeof v==='number')o.push(v)})}else o.push(asNum(x))});return o};
      switch(key){
        case 'SUM':case 'SOMA':return nums().reduce((s,x)=>s+x,0);
        case 'AVERAGE':case 'MEDIA':{const n=nums();if(!n.length)throw new Error('#DIV/0');return n.reduce((s,x)=>s+x,0)/n.length}
        case 'MIN':case 'MINIMO':{const n=nums();return n.length?Math.min(...n):0}
        case 'MAX':case 'MAXIMO':{const n=nums();return n.length?Math.max(...n):0}
        case 'COUNT':case 'CONT.NUM':return nums().length;
        case 'ROUND':case 'ARRED':{const d=a[1]===undefined?0:asNum(a[1]);const f=Math.pow(10,d);return Math.round(asNum(a[0])*f)/f}
        case 'ABS':return Math.abs(asNum(a[0]));
        default:throw new Error('#NOME');
      }
    }
    function prim(){
      const t=T[i++];if(!t)throw new Error('#ERRO');
      if(t.t==='n'||t.t==='s')return t.v;
      if(t.t==='ref'){const v=get(t.v);if(v&&v.err)throw new Error(v.err);return v}
      if(t.t==='fn')return call(t.v);
      if(t.t==='op'&&t.v==='('){const v=cmp();if(!isOp(')'))throw new Error('#ERRO');i++;return v}
      throw new Error('#ERRO');
    }
    function post(){let v=prim();while(isOp('%')){i++;v=asNum(v)/100}return v}
    function unary(){if(isOp('-')){i++;return -asNum(unary())}if(isOp('+')){i++;return asNum(unary())}return post()}
    function pow(){const a=unary();if(isOp('^')){i++;const b=pow();return Math.pow(asNum(a),asNum(b))}return a}
    function mul(){let a=pow();while(isOp('*')||isOp('/')){const op=T[i++].v;const b=pow();if(op==='/'){const d=asNum(b);if(d===0)throw new Error('#DIV/0');a=asNum(a)/d}else a=asNum(a)*asNum(b)}return a}
    function add(){let a=mul();while(isOp('+')||isOp('-')){const op=T[i++].v;const b=mul();a=op==='+'?asNum(a)+asNum(b):asNum(a)-asNum(b)}return a}
    function cmp(){
      let a=add();
      while(T[i]&&T[i].t==='op'&&['=','<','>','<=','>=','<>'].includes(T[i].v)){
        const op=T[i++].v;const b=add();
        const x=a,y=b;
        a=(op==='='?x==y:op==='<'?x<y:op==='>'?x>y:op==='<='?x<=y:op==='>='?x>=y:x!=y)?1:0;
      }
      return a;
    }
    const v=cmp();if(i<T.length)throw new Error('#ERRO');
    return v;
  }
  function get(ref){
    ref=ref.toUpperCase();
    if(cache.has(ref))return cache.get(ref);
    const cell=ref in sh.cells?sh.cells[ref]:null;
    if(!cell||cell.v===''||cell.v==null){cache.set(ref,'');return ''}
    const raw=String(cell.v);
    let res;
    if(raw[0]==='='){
      if(stack.has(ref))return {err:'#CICLO'};
      stack.add(ref);
      try{res=calc(raw.slice(1))}catch(e){res={err:(e&&e.message&&e.message[0]==='#')?e.message:'#ERRO'}}
      stack.delete(ref);
      if(typeof res==='number'&&!isFinite(res))res={err:'#ERRO'};
    }else{const n=toNum(raw);res=n!==null?n:raw}
    cache.set(ref,res);return res;
  }
  return get;
}
function totalsFor(sh,get){
  const start=sh.header?1:0,out=[];
  for(let c=0;c<sh.cols;c++){
    if((sh.noTot||[]).includes(c)){out.push(null);continue}
    let s=0,cnt=0,f='auto';
    for(let r=start;r<sh.rows;r++){
      const ref=nm([c,r]),v=get(ref);
      if(typeof v==='number'){s+=v;cnt++;if(cnt===1)f=(sh.cells[ref]&&sh.cells[ref].f)||'auto'}
    }
    if(!cnt||f==='percent'||f==='date'||f==='text')out.push(null);
    else out.push({v:s,f,range:colName(c)+(start+1)+':'+colName(c)+sh.rows});
  }
  return out;
}
function shiftFormula(f,dr,dc){
  return f.replace(REFRE,(m,c1,r1,c2,r2)=>{
    const a=[colIdx(c1)+dc,Number(r1)-1+dr];if(a[0]<0||a[1]<0)return '#REF!';
    if(!c2)return nm(a);
    const b=[colIdx(c2)+dc,Number(r2)-1+dr];if(b[0]<0||b[1]<0)return '#REF!';
    return nm(a)+':'+nm(b);
  });
}
function structFormula(f,axis,idx,cnt,mode){
  const k=axis==='r'?1:0;
  return f.replace(REFRE,(m,c1,r1,c2,r2)=>{
    const a=[colIdx(c1),Number(r1)-1],b=c2?[colIdx(c2),Number(r2)-1]:null;
    if(!b){
      let v=a[k];
      if(mode==='ins'){if(v>=idx)v+=cnt}
      else{if(v>=idx&&v<idx+cnt)return '#REF!';if(v>=idx+cnt)v-=cnt}
      a[k]=v;return nm(a);
    }
    let s=a[k],e=b[k];
    if(mode==='ins'){if(s>=idx)s+=cnt;if(e>=idx)e+=cnt}
    else{
      const ns=s<idx?s:(s<idx+cnt?idx:s-cnt),ne=e<idx?e:(e<idx+cnt?idx-1:e-cnt);
      if(ne<ns)return '#REF!';s=ns;e=ne;
    }
    a[k]=s;b[k]=e;return nm(a)+':'+nm(b);
  });
}
function remap(sh,axis,idx,cnt,mode){
  const nc={};
  Object.keys(sh.cells).forEach(ref=>{
    const [c,r]=refRC(ref);let pos=axis==='r'?r:c;
    if(mode==='ins'){if(pos>=idx)pos+=cnt}
    else{if(pos>=idx&&pos<idx+cnt)return;if(pos>=idx+cnt)pos-=cnt}
    const cell=Object.assign({},sh.cells[ref]);
    if(typeof cell.v==='string'&&cell.v[0]==='=')cell.v='='+structFormula(cell.v.slice(1),axis,idx,cnt,mode);
    nc[axis==='r'?nm([c,pos]):nm([pos,r])]=cell;
  });
  sh.cells=nc;
  if(axis==='r')sh.rows+=mode==='ins'?cnt:-cnt;
  else{
    sh.cols+=mode==='ins'?cnt:-cnt;
    sh.noTot=(sh.noTot||[]).map(x=>mode==='ins'?(x>=idx?x+cnt:x):(x<idx?x:(x<idx+cnt?-1:x-cnt))).filter(x=>x>=0);
    if(sh.colw){if(mode==='ins')sh.colw.splice(idx,0,...Array(cnt).fill(9.5));else sh.colw.splice(idx,cnt)}
  }
}
function sortRows(sh,col,dir){
  const start=sh.header?1:0,get=evalSheet(sh);
  const keyOf=r=>{const v=get(nm([col,r]));if(v===''||v==null)return null;if(typeof v==='number')return v;if(v&&v.err)return String(v.err);return dateKey(String(v))||String(v).toLowerCase()};
  const keyed=[];for(let r=start;r<sh.rows;r++)keyed.push({r,k:keyOf(r)});
  keyed.sort((a,b)=>{
    if(a.k===null&&b.k===null)return a.r-b.r;
    if(a.k===null)return 1;if(b.k===null)return -1;
    const cmp=(typeof a.k==='number'&&typeof b.k==='number')?a.k-b.k:String(a.k).localeCompare(String(b.k),'pt-BR',{numeric:true});
    return (dir==='desc'?-cmp:cmp)||a.r-b.r;
  });
  const nc={};
  Object.keys(sh.cells).forEach(ref=>{const [c,r]=refRC(ref);if(r<start)nc[ref]=sh.cells[ref]});
  keyed.forEach((o,i)=>{
    const nr=start+i;
    for(let c=0;c<sh.cols;c++){
      const old=sh.cells[nm([c,o.r])];if(!old)continue;
      const cp=Object.assign({},old);
      if(typeof cp.v==='string'&&cp.v[0]==='=')cp.v='='+shiftFormula(cp.v.slice(1),nr-o.r,0);
      nc[nm([c,nr])]=cp;
    }
  });
  sh.cells=nc;
}
function parseCSV(text){
  text=text.replace(/^﻿/,'');
  const first=text.split(/\r?\n/)[0]||'';
  const cnt=ch=>first.split(ch).length-1;
  const delim=(cnt(';')>0&&cnt(';')>=cnt(',')&&cnt(';')>=cnt('\t'))?';':(cnt('\t')>cnt(',')?'\t':',');
  const rows=[];let row=[],cur='',q=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(q){if(ch==='"'){if(text[i+1]==='"'){cur+='"';i++}else q=false}else cur+=ch}
    else if(ch==='"')q=true;
    else if(ch===delim){row.push(cur);cur=''}
    else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cur);cur='';rows.push(row);row=[]}
    else cur+=ch;
  }
  if(cur!==''||row.length){row.push(cur);rows.push(row)}
  return rows.filter(r=>r.some(x=>String(x).trim()!==''));
}

/* ----- modelos prontos ----- */
const mkd=n=>mk(TODAY)+'-'+pad(n);
const TPLS={
 mensal:{name:'Controle financeiro mensal',desc:'Entradas, saídas e saldo diário; preencha seus valores',head:['Data','Descrição','Categoria','Entrada','Saída','Saldo'],fmt:['date','text','text','money','money','money'],colw:[8.5,14,10,9.5,9.5,9.5],noTot:[5],n:16,f:{5:['=IF(A{r}="";"";D{r}-E{r})','=IF(A{r}="";"";F{p}+D{r}-E{r})']}},
 despesas:{name:'Despesas pessoais',desc:'Compare o valor que planejou com o seu gasto real',head:['Despesa','Categoria','Previsto','Gasto real','Diferença','% usado'],fmt:['text','text','money','money','money','percent'],colw:[13,11,9.5,9.5,9.5,8],noTot:[5],n:14,f:{4:['=IF(A{r}="";"";C{r}-D{r})'],5:['=IF(A{r}="";"";IF(C{r}=0;0;D{r}/C{r}))']}},
 fluxo:{name:'Fluxo de caixa empresarial',desc:'Registre as entradas e saídas reais da empresa',head:['Mês','Entradas','Saídas','Resultado','Saldo acumulado'],fmt:['text','money','money','money','money'],colw:[11,10.5,10.5,10.5,12],noTot:[4],n:12,f:{3:['=IF(A{r}="";"";B{r}-C{r})'],4:['=IF(A{r}="";"";D{r})','=IF(A{r}="";"";E{p}+D{r})']}},
 dividas:{name:'Controle de dívidas',desc:'Anote suas dívidas e parcelas para calcular o saldo restante',head:['Dívida','Credor','Valor total','Nº de parcelas','Parcelas pagas','Valor da parcela','Falta pagar'],fmt:['text','text','money','number','number','money','money'],colw:[14,11,10,9,9,10,10],noTot:[3,4],n:10,f:{5:['=IF(A{r}="";"";IF(D{r}=0;0;C{r}/D{r}))'],6:['=IF(A{r}="";"";(D{r}-E{r})*F{r})']}},
 economia:{name:'Planejamento de economia',desc:'Defina suas metas e preencha o quanto já guardou',head:['Meta','Valor da meta','Já guardei','Falta','% concluído','Meses restantes','Guardar por mês'],fmt:['text','money','money','money','percent','number','money'],colw:[15,10,10,10,9,9,10],noTot:[4,5],n:10,f:{3:['=IF(A{r}="";"";B{r}-C{r})'],4:['=IF(A{r}="";"";IF(B{r}=0;0;C{r}/B{r}))'],6:['=IF(A{r}="";"";IF(F{r}=0;D{r};D{r}/F{r}))']}},
 assinaturas:{name:'Controle de assinaturas',desc:'Registre os serviços que você realmente assina',head:['Serviço','Valor por mês','Valor por ano','Dia da cobrança','Ainda uso?'],fmt:['text','money','money','number','text'],colw:[16,10,10,9,10],noTot:[3,4],n:10,f:{2:['=IF(A{r}="";"";B{r}*12)']}},
 investimentos:{name:'Planejamento de investimentos',desc:'Registre aplicações e rentabilidades informadas por você',head:['Investimento','Valor aplicado','Rentabilidade ao ano','Rendimento em 1 ano','Total em 1 ano'],fmt:['text','money','percent','money','money'],colw:[15,11,11,11,11],noTot:[2],n:10,f:{3:['=IF(A{r}="";"";B{r}*C{r})'],4:['=IF(A{r}="";"";B{r}+D{r})']}},
 orcamento:{name:'Orçamento familiar',desc:'Organize os gastos reais da sua família',head:['Item','Categoria','Valor por mês','Quem paga','Observação'],fmt:['text','text','money','text','text'],colw:[16,11,11,10,14],noTot:[],n:14}
};
function buildTpl(id){
  const t=TPLS[id],cols=t.head.length;
  const sh={id:uid(),name:t.name,rows:1+t.n,cols,header:true,totals:true,noTot:(t.noTot||[]).slice(),colw:t.colw.slice(),cells:{}};
  t.head.forEach((h,c)=>{sh.cells[nm([c,0])]={v:h,f:'text'}});
  for(let i=0;i<t.n;i++){
    const r=i+1;
    for(let c=0;c<cols;c++){
      let v='';const fc=t.f&&t.f[c];
      if(fc)v=(i===0?fc[0]:(fc[1]||fc[0])).replace(/\{r\}/g,r+1).replace(/\{p\}/g,r);
      if((v!==undefined&&v!=='')||t.fmt[c]!=='text')sh.cells[nm([c,r])]={v:v==null?'':String(v),f:t.fmt[c]};
    }
  }
  return sh;
}
function blankSheet(){return {id:uid(),name:'Planilha em branco',rows:15,cols:6,header:false,totals:false,noTot:[],colw:null,cells:{}}}
if(!Array.isArray(S.sheets))S.sheets=[];

/* ===== PLANILHAS: tela ===== */
ui.sheetId=null;ui.sel=null;ui.anchor=null;ui.sf='';
const cur=()=>S.sheets.find(s=>s.id===ui.sheetId)||S.sheets[0]||null;
const selRange=()=>{const s=ui.sel||{r1:0,c1:0,r2:0,c2:0};return {r1:Math.min(s.r1,s.r2),r2:Math.max(s.r1,s.r2),c1:Math.min(s.c1,s.c2),c2:Math.max(s.c1,s.c2)}};
const SWATCH=['#fde68a','#bbf7d0','#bfdbfe','#fecaca','#e9d5ff','#fed7aa'];
const FMTS=[['auto','Automático'],['money','Dinheiro (R$)'],['number','Número'],['percent','Porcentagem'],['date','Data'],['text','Texto']];
const ICON_GRID='<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>';
ICONS.grid=ICON_GRID;

function gridHTML(sh){
  const get=evalSheet(sh);
  let h='<table class="sheet"><colgroup><col style="width:3rem">';
  for(let c=0;c<sh.cols;c++)h+='<col style="width:'+((sh.colw&&sh.colw[c])||9.5)+'rem">';
  h+='</colgroup><thead><tr><th class="corner"></th>';
  for(let c=0;c<sh.cols;c++)h+='<th scope="col" data-a="selCol" data-i="'+c+'" title="Selecionar a coluna '+colName(c)+'">'+colName(c)+'</th>';
  h+='</tr></thead><tbody>';
  for(let r=0;r<sh.rows;r++){
    h+='<tr data-r="'+r+'"'+(sh.header&&r===0?' class="hdr"':'')+'><th scope="row" data-a="selRow" data-i="'+r+'" title="Selecionar a linha '+(r+1)+'">'+(r+1)+'</th>';
    for(let c=0;c<sh.cols;c++){
      const ref=nm([c,r]),cell=sh.cells[ref]||{},v=get(ref);
      h+='<td data-r="'+r+'" data-c="'+c+'"'+(cell.bg?' style="background:'+cell.bg+';color:#111"':'')+'><input class="cell'+(typeof v==='number'?' n':'')+(v&&v.err?' err':'')+'" id="c-'+ref+'" data-r="'+r+'" data-c="'+c+'" value="'+esc(fmtVal(v,cell.f||'auto'))+'" aria-label="Célula '+ref+'" autocomplete="off" spellcheck="false"></td>';
    }
    h+='</tr>';
  }
  h+='</tbody>';
  if(sh.totals){
    h+='<tfoot><tr class="total"><th scope="row">Σ</th>';
    for(let c=0;c<sh.cols;c++)h+='<td class="tot'+(c===0?' lbl':'')+'" id="t-'+c+'"></td>';
    h+='</tr></tfoot>';
  }
  return h+'</table>';
}
function paintTotals(sh,get){
  if(!sh.totals)return;
  const tot=totalsFor(sh,get);
  tot.forEach((t,c)=>{const el=document.getElementById('t-'+c);if(!el)return;el.textContent=t?fmtVal(t.v,t.f):(c===0?'Total':'')});
}
function refreshValues(forceEl){
  const sh=cur();if(!sh)return;
  const get=evalSheet(sh),act=document.activeElement;
  document.querySelectorAll('input.cell').forEach(inp=>{
    if(inp!==forceEl&&inp===act)return;
    const ref=nm([+inp.dataset.c,+inp.dataset.r]),v=get(ref),cell=sh.cells[ref]||{};
    inp.value=fmtVal(v,cell.f||'auto');
    inp.classList.toggle('n',typeof v==='number');
    inp.classList.toggle('err',!!(v&&v.err));
  });
  paintTotals(sh,get);
}
function paintSel(){
  const rg=selRange(),has=!!ui.sel;
  document.querySelectorAll('#gridwrap td[data-r]').forEach(td=>{
    const r=+td.dataset.r,c=+td.dataset.c;
    td.classList.toggle('sel',has&&r>=rg.r1&&r<=rg.r2&&c>=rg.c1&&c<=rg.c2);
  });
  document.querySelectorAll('#gridwrap thead th[data-i]').forEach(th=>{const c=+th.dataset.i;th.classList.toggle('on',has&&c>=rg.c1&&c<=rg.c2)});
  document.querySelectorAll('#gridwrap tbody th[data-i]').forEach(th=>{const r=+th.dataset.i;th.classList.toggle('on',has&&r>=rg.r1&&r<=rg.r2)});
}
function syncTool(){
  const sh=cur();if(!sh)return;
  const el=document.getElementById('fref');if(!el)return;
  const rg=selRange(),ref=nm([rg.c1,rg.r1]);
  el.textContent=(rg.r1===rg.r2&&rg.c1===rg.c2)?ref:ref+':'+nm([rg.c2,rg.r2]);
  const fb=document.getElementById('fbar');
  if(fb&&document.activeElement!==fb)fb.value=(sh.cells[ref]&&sh.cells[ref].v)||'';
  const fs=document.getElementById('fmtsel');if(fs)fs.value=(sh.cells[ref]&&sh.cells[ref].f)||'auto';
}
function applyFilter(){
  const sh=cur();if(!sh)return;
  const q=norm((ui.sf||'').trim());
  document.querySelectorAll('#gridwrap tbody tr').forEach(tr=>{
    const r=+tr.dataset.r;
    if(!q||(sh.header&&r===0)){tr.hidden=false;return}
    const txt=norm(Array.from(tr.querySelectorAll('input.cell')).map(i=>i.value).join(' '));
    tr.hidden=!txt.includes(q);
  });
}
function rebuildGrid(){
  const sh=cur(),w=document.getElementById('gridwrap');if(!sh||!w)return;
  w.innerHTML=gridHTML(sh);applyFilter();paintSel();syncTool();
}
function viewPlanilhas(){
  if(!S.sheets.length)return '<div class="card empty"><b>Você não tem planilhas</b><span>Crie uma a partir de um modelo pronto ou traga um arquivo do Excel.</span><div class="opts" style="justify-content:center"><button class="btn primary" data-a="newSheet">Criar planilha</button><button class="btn" data-a="impSheet">Importar arquivo</button></div></div>';
  const sh=cur();
  const chips='<div class="chips">'+S.sheets.map(s=>'<button class="btn sm chip" data-a="sheetGo" data-id="'+s.id+'" aria-pressed="'+(s.id===sh.id)+'">'+esc(s.name)+'</button>').join('')+'<button class="btn sm" data-a="newSheet">'+ic('plus')+'Nova planilha</button></div>';
  const rg=selRange();
  const tools='<div class="card tools">'+
   '<div class="trow"><button class="btn sm" data-a="renameSheet">Renomear</button><button class="btn sm" data-a="dupSheet">Duplicar</button><button class="btn sm danger" data-a="delSheet">Excluir planilha</button><span class="sp"></span><button class="btn sm" data-a="impSheet">Importar</button><button class="btn sm" data-a="expSheet">Exportar</button><button class="btn sm" data-a="helpF">Ajuda com fórmulas</button></div>'+
   '<div class="trow"><div class="fbar"><span class="ref" id="fref">A1</span><label class="sr" for="fbar">Valor ou fórmula da célula selecionada</label><input id="fbar" placeholder="Valor ou fórmula. Exemplo: =SOMA(B2:B10)" autocomplete="off" spellcheck="false"></div></div>'+
   '<div class="trow"><span class="gl">Formato</span><select id="fmtsel" aria-label="Formato das células selecionadas">'+FMTS.map(f=>'<option value="'+f[0]+'">'+f[1]+'</option>').join('')+'</select>'+
   '<span class="gl">Cor</span>'+SWATCH.map(c=>'<button class="sw" style="background:'+c+'" data-a="cellBg" data-v="'+c+'" aria-label="Pintar de '+c+'"></button>').join('')+'<button class="btn sm" data-a="cellBg" data-v="">Sem cor</button><button class="btn sm" data-a="clearSel">Limpar células</button></div>'+
   '<div class="trow"><span class="gl">Linhas</span><button class="btn sm" data-a="addRow">Adicionar no fim</button><button class="btn sm" data-a="insRow">Inserir acima</button><button class="btn sm danger" data-a="delRow">Excluir</button>'+
   '<span class="gl">Colunas</span><button class="btn sm" data-a="addCol">Adicionar no fim</button><button class="btn sm" data-a="insCol">Inserir à esquerda</button><button class="btn sm danger" data-a="delCol">Excluir</button></div>'+
   '<div class="trow"><button class="btn sm" data-a="sortAsc">Ordenar A→Z</button><button class="btn sm" data-a="sortDesc">Ordenar Z→A</button><button class="btn sm" data-a="fillDown">Copiar para baixo</button>'+
   '<button class="btn sm chip" data-a="toggleTot" aria-pressed="'+!!sh.totals+'">Linha de totais</button><button class="btn sm" data-a="toggleColTot">Total desta coluna: ligar/desligar</button><button class="btn sm chip" data-a="toggleHead" aria-pressed="'+!!sh.header+'">Primeira linha é título</button></div>'+
   '<div class="trow"><label class="gl" for="sfilter">Filtrar linhas</label><input id="sfilter" type="search" placeholder="Digite para mostrar só as linhas com essa palavra" value="'+esc(ui.sf)+'" style="flex:1;min-width:12rem"></div></div>';
  return chips+tools+'<div class="gridwrap" id="gridwrap">'+gridHTML(sh)+'</div><p class="hint">Clique em uma célula e escreva. Para fazer uma conta, comece com = (exemplo: <b>=B2*3</b> ou <b>=SOMA(B2:B10)</b>). As contas se atualizam sozinhas. Tudo é salvo automaticamente na sua conta. Toque em uma letra ou número para selecionar a coluna ou a linha. Segure Shift e clique para selecionar várias células.</p>';
}
function afterSheet(){paintSel();syncTool();applyFilter()}

/* ----- ações das planilhas ----- */
function applyToSel(fn){
  const sh=cur();if(!sh)return;const rg=selRange();
  for(let r=rg.r1;r<=rg.r2;r++)for(let c=rg.c1;c<=rg.c2;c++){
    const ref=nm([c,r]);const cell=sh.cells[ref]||(sh.cells[ref]={v:''});
    fn(cell);
    if((cell.v===''||cell.v==null)&&!cell.bg&&(!cell.f||cell.f==='auto'))delete sh.cells[ref];
  }
  save();rebuildGrid();
}
function setRaw(sh,ref,raw){
  let cell=sh.cells[ref];
  if(!cell){if(raw==='')return;cell=sh.cells[ref]={v:''}}
  cell.v=raw;
  if(raw!==''&&(!cell.f||cell.f==='auto')){
    if(raw[0]!=='='&&/^-?[\d.,]+\s*%$/.test(raw))cell.f='percent';
    else if(/^R\$/i.test(raw))cell.f='money';
  }
  if(raw===''&&!cell.bg&&(!cell.f||cell.f==='auto'))delete sh.cells[ref];
}
function commitCell(t){
  const sh=cur();if(!sh)return;
  const ref=nm([+t.dataset.c,+t.dataset.r]);
  const prev=(sh.cells[ref]&&sh.cells[ref].v)||'';
  if(t.value!==prev){setRaw(sh,ref,t.value);save()}
  refreshValues(t);
}
function copyText(text,okMsg){
  const fallback=()=>openModal('<h2>Copie o texto abaixo</h2><textarea id="cpy" rows="8" style="width:100%;border:2px solid var(--line);border-radius:.8rem;padding:.6rem;background:var(--surface-2)" readonly></textarea><div class="mfoot"><button class="btn primary" data-a="closeModal">Fechar</button></div>',r=>{const ta=r.querySelector('#cpy');ta.value=text;ta.focus();ta.select()});
  try{navigator.clipboard.writeText(text).then(()=>toast(okMsg),fallback)}catch(e){fallback()}
}
function sheetMatrix(sh){
  const get=evalSheet(sh),tot=sh.totals?totalsFor(sh,get):null,rows=[];
  for(let r=0;r<sh.rows;r++){const row=[];for(let c=0;c<sh.cols;c++){const ref=nm([c,r]);row.push({v:get(ref),f:(sh.cells[ref]&&sh.cells[ref].f)||'auto',ref,raw:(sh.cells[ref]&&sh.cells[ref].v)||''})}rows.push(row)}
  return {rows,tot,get};
}
function exportText(sh,delim){
  const {rows,tot}=sheetMatrix(sh);
  const cellTxt=o=>{
    if(o.v&&o.v.err)return o.v.err;if(o.v===''||o.v==null)return '';
    if(typeof o.v==='number'){if(o.f==='percent')return nfPct.format(o.v*100)+'%';return String(Math.round(o.v*1e6)/1e6).replace('.',',')}
    return fmtVal(o.v,o.f);
  };
  const q=s=>{s=String(s);return (s.includes(delim)||s.includes('"')||s.includes('\n'))?'"'+s.replace(/"/g,'""')+'"':s};
  const lines=rows.map(r=>r.map(o=>q(cellTxt(o))).join(delim));
  if(tot){lines.push(tot.map((t,c)=>q(t?String(Math.round(t.v*1e6)/1e6).replace('.',','):(c===0?'Total':''))).join(delim))}
  return lines.join('\r\n');
}
function toExcelFormula(f){
  const MAP={SOMA:'SUM',MEDIA:'AVERAGE','MÉDIA':'AVERAGE',MINIMO:'MIN','MÍNIMO':'MIN',MAXIMO:'MAX','MÁXIMO':'MAX','CONT.NÚM':'COUNT','CONT.NUM':'COUNT',ARRED:'ROUND',SE:'IF'};
  return f.replace(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.]*)\(/g,(m,n)=>(MAP[n.toUpperCase()]||n.toUpperCase())+'(').replace(/;/g,',');
}
function buildXlsx(sh){
  const {rows,tot}=sheetMatrix(sh),ws={};
  const Z={money:'"R$" #,##0.00',percent:'0.00%',number:'#,##0.00'};
  let maxR=-1,maxC=-1;
  rows.forEach((row,r)=>row.forEach((o,c)=>{
    if(o.v===''||o.v==null)return;
    const x={};
    if(typeof o.v==='number'){x.t='n';x.v=o.v;if(Z[o.f])x.z=Z[o.f]}
    else if(o.v&&o.v.err){x.t='s';x.v=o.v.err}
    else{x.t='s';x.v=String(o.v)}
    if(typeof o.raw==='string'&&o.raw[0]==='='&&!(o.v&&o.v.err))x.f=toExcelFormula(o.raw.slice(1));
    ws[o.ref]=x;maxR=Math.max(maxR,r);maxC=Math.max(maxC,c);
  }));
  if(tot){
    const tr=sh.rows;
    tot.forEach((t,c)=>{
      if(t){ws[nm([c,tr])]={t:'n',v:t.v,f:'SUM('+t.range+')',z:Z[t.f]};maxC=Math.max(maxC,c)}
      else if(c===0)ws[nm([c,tr])]={t:'s',v:'Total'};
    });
    maxR=Math.max(maxR,tr);
  }
  ws['!ref']='A1:'+colName(Math.max(maxC,0))+(Math.max(maxR,0)+1);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,sh.name.replace(/[\\\/?*\[\]:]/g,' ').slice(0,31)||'Planilha');
  return XLSX.write(wb,{bookType:'xlsx',type:'array'});
}
async function saveFile(filename,data){
  const mime=filename.toLowerCase().endsWith('.xlsx')?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/csv;charset=utf-8';
  if(DL){
    try{await DL.save({filename,data});toast('Arquivo pronto.');return}
    catch(e){if(e&&e.code==='declined')return}
  }
  try{
    const url=URL.createObjectURL(new Blob([data],{type:mime}));
    const link=document.createElement('a');link.href=url;link.download=filename;link.style.display='none';
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('Arquivo pronto.');
  }catch(e){toast('Não foi possível salvar o arquivo.')}
}
let DL=null;
try{if(window.claude&&window.claude.use)window.claude.use('downloads').then(d=>{DL=d},()=>{})}catch(e){}
const safeName=s=>s.replace(/[\\\/:*?"<>|]/g,' ').trim().slice(0,60)||'planilha';
function exportModal(){
  openModal('<h2>Exportar planilha</h2><div class="form">'+
   '<button class="btn primary big" data-a="expXlsx">Baixar para o Excel (.xlsx)</button>'+
   '<button class="btn big" data-a="expCsv">Baixar como CSV (.csv)</button>'+
   '<button class="btn big" data-a="expCopy">Copiar para colar no Excel</button>'+
   (DL?'':'<p class="hint">Neste modo o download de arquivos não está disponível. Use o botão de copiar e cole direto no Excel.</p>')+
   '</div><div class="mfoot"><button class="btn" data-a="closeModal">Fechar</button></div>');
}
function helpModal(){
  openModal('<h2>Como usar fórmulas</h2><div class="form"><p style="margin:0">Comece sempre com o sinal <b>=</b>. Use os nomes das células, como B2.</p>'+
   '<div><b>Contas simples</b><br>=B2+C2 &nbsp; =B2-C2 &nbsp; =B2*C2 &nbsp; =B2/C2 &nbsp; =B2*10%</div>'+
   '<div><b>Somar várias células</b><br>=SOMA(B2:B10)</div>'+
   '<div><b>Média, menor e maior</b><br>=MEDIA(B2:B10) &nbsp; =MINIMO(B2:B10) &nbsp; =MAXIMO(B2:B10)</div>'+
   '<div><b>Contar números</b><br>=CONT.NUM(B2:B10)</div>'+
   '<div><b>Arredondar</b><br>=ARRED(B2/3;2)</div>'+
   '<div><b>Decidir (SE)</b><br>=SE(B2&gt;100;1;0) &nbsp; mostra 1 se B2 for maior que 100</div>'+
   '<p class="hint" style="margin:0">Dentro das fórmulas use ponto nos decimais (1.5) e ponto e vírgula para separar (;). As funções em inglês (SUM, AVERAGE, IF) também funcionam.</p></div><div class="mfoot"><button class="btn primary" data-a="closeModal">Entendi</button></div>');
}
function importFile(){
  const inp=document.createElement('input');inp.type='file';inp.accept='.csv,.txt,.tsv,.xlsx,.xls';
  inp.onchange=()=>{
    const f=inp.files&&inp.files[0];if(!f)return;
    const name=f.name.replace(/\.[^.]+$/,'');
    const rd=new FileReader();
    if(/\.(xlsx|xls)$/i.test(f.name)){
      if(typeof XLSX==='undefined'){toast('Não foi possível carregar o leitor de Excel.');return}
      rd.onload=()=>{try{
        const wb=XLSX.read(rd.result,{type:'array',cellDates:true});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
        const dates={};
        const rows=aoa.map((row,r)=>row.map((v,c)=>{
          if(v instanceof Date){const d=new Date(v.getTime()+43200000);dates[r+','+c]=1;return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())}
          if(typeof v==='number')return String(v).replace('.',',');
          return String(v==null?'':v);
        }));
        importRows(rows,name,dates);
      }catch(e){toast('Não consegui abrir esse arquivo do Excel.')}};
      rd.readAsArrayBuffer(f);
    }else{
      rd.onload=()=>{let t=String(rd.result);
        if(t.indexOf(String.fromCharCode(65533))>=0){const r2=new FileReader();r2.onload=()=>importRows(parseCSV(String(r2.result)),name,{});r2.readAsText(f,'windows-1252');return}
        importRows(parseCSV(t),name,{});};
      rd.readAsText(f,'utf-8');
    }
  };
  inp.click();
}
function importRows(rows,name,dates){
  if(!rows.length){toast('O arquivo está vazio.');return}
  const cols=Math.min(26,Math.max(...rows.map(r=>r.length),1)),nr=Math.min(500,rows.length);
  const sh={id:uid(),name:name||'Planilha importada',rows:Math.max(nr,10),cols,header:true,totals:false,noTot:[],colw:null,cells:{}};
  for(let r=0;r<nr;r++)for(let c=0;c<cols;c++){
    const v=rows[r][c];if(v===undefined||String(v).trim()==='')continue;
    const cell={v:String(v).trim()};if(dates[r+','+c])cell.f='date';
    sh.cells[nm([c,r])]=cell;
  }
  S.sheets.push(sh);ui.sheetId=sh.id;ui.sel=null;save();ui.view='planilhas';render();
  toast('Planilha importada com '+nr+' linhas.'+(rows.length>500?' Só as primeiras 500 foram trazidas.':'')+' Fórmulas do arquivo viram valores.');
}
const SA={
  sheetGo(d){ui.sheetId=d.id;ui.sel=null;ui.sf='';render()},
  newSheet(){
    openModal('<h2>Nova planilha</h2><p class="hint" style="margin:0 0 .8rem">Escolha um modelo vazio. Os modelos mantêm cabeçalhos e fórmulas, sem preencher valores por você.</p><div class="list">'+
      Object.keys(TPLS).map(k=>'<button class="item" style="text-align:left;cursor:pointer" data-a="pickTpl" data-id="'+k+'"><b>'+esc(TPLS[k].name)+'</b><span class="hint">'+esc(TPLS[k].desc)+'</span></button>').join('')+
      '<button class="item" style="text-align:left;cursor:pointer" data-a="pickTpl" data-id="blank"><b>Planilha em branco</b><span class="hint">Comece do zero, como no Excel</span></button></div><div class="mfoot"><button class="btn" data-a="closeModal">Cancelar</button></div>');
  },
  pickTpl(d){const sh=d.id==='blank'?blankSheet():buildTpl(d.id);S.sheets.push(sh);ui.sheetId=sh.id;ui.sel=null;ui.sf='';save();closeModal();ui.view='planilhas';render();toast('Planilha vazia criada.')},
  renameSheet(){
    const sh=cur();if(!sh)return;
    openModal('<h2>Renomear planilha</h2><div class="field"><label for="rn">Novo nome</label><input id="rn" maxlength="40" value="'+esc(sh.name)+'"></div><div class="mfoot"><button class="btn" data-a="closeModal">Cancelar</button><button class="btn primary" id="rnok">Salvar</button></div>',r=>{
      const go=()=>{const v=r.querySelector('#rn').value.trim();if(!v)return;sh.name=v;save();closeModal();render()};
      r.querySelector('#rnok').addEventListener('click',go);r.querySelector('#rn').addEventListener('keydown',e=>{if(e.key==='Enter')go()});
    });
  },
  dupSheet(){const sh=cur();if(!sh)return;const c=JSON.parse(JSON.stringify(sh));c.id=uid();c.name='Cópia de '+sh.name;S.sheets.push(c);ui.sheetId=c.id;save();render();toast('Planilha duplicada.')},
  delSheet(){const sh=cur();if(!sh)return;confirmBox('Excluir esta planilha?','A planilha "'+sh.name+'" e tudo que está nela serão removidos.','Sim, excluir',()=>{S.sheets=S.sheets.filter(s=>s.id!==sh.id);ui.sheetId=null;ui.sel=null;save();render();toast('Planilha excluída.')})},
  impSheet(){importFile()},
  expSheet(){if(cur())exportModal()},
  expXlsx(){const sh=cur();if(!sh)return;if(typeof XLSX==='undefined'){toast('Não foi possível carregar o Excel.');return}closeModal();saveFile(safeName(sh.name)+'.xlsx',buildXlsx(sh))},
  expCsv(){const sh=cur();if(!sh)return;closeModal();saveFile(safeName(sh.name)+'.csv','﻿'+exportText(sh,';'))},
  expCopy(){const sh=cur();if(!sh)return;closeModal();copyText(exportText(sh,'\t'),'Copiado. Cole no Excel com Ctrl+V.')},
  helpF(){helpModal()},
  selCol(d){const sh=cur(),c=+d.i;ui.sel={r1:0,c1:c,r2:sh.rows-1,c2:c};ui.anchor={r:0,c};paintSel();syncTool()},
  selRow(d){const sh=cur(),r=+d.i;ui.sel={r1:r,c1:0,r2:r,c2:sh.cols-1};ui.anchor={r,c:0};paintSel();syncTool()},
  cellBg(d){applyToSel(cell=>{cell.bg=d.v||''})},
  clearSel(){applyToSel(cell=>{cell.v=''})},
  addRow(){const sh=cur();if(sh.rows>=500){toast('Limite de 500 linhas.');return}sh.rows++;save();rebuildGrid()},
  insRow(){const sh=cur();if(sh.rows>=500){toast('Limite de 500 linhas.');return}remap(sh,'r',selRange().r1,1,'ins');save();rebuildGrid()},
  delRow(){
    const sh=cur(),rg=selRange(),n=rg.r2-rg.r1+1;
    if(sh.rows-n<1){toast('A planilha precisa ter pelo menos uma linha.');return}
    confirmBox('Excluir '+(n>1?n+' linhas':'a linha '+(rg.r1+1))+'?','Os dados '+(n>1?'dessas linhas':'dessa linha')+' serão removidos e as fórmulas ajustadas.','Sim, excluir',()=>{remap(sh,'r',rg.r1,n,'del');ui.sel=null;save();rebuildGrid()});
  },
  addCol(){const sh=cur();if(sh.cols>=26){toast('Limite de 26 colunas (A até Z).');return}sh.cols++;if(sh.colw)sh.colw.push(9.5);save();rebuildGrid()},
  insCol(){const sh=cur();if(sh.cols>=26){toast('Limite de 26 colunas (A até Z).');return}remap(sh,'c',selRange().c1,1,'ins');save();rebuildGrid()},
  delCol(){
    const sh=cur(),rg=selRange(),n=rg.c2-rg.c1+1;
    if(sh.cols-n<1){toast('A planilha precisa ter pelo menos uma coluna.');return}
    confirmBox('Excluir '+(n>1?n+' colunas':'a coluna '+colName(rg.c1))+'?','Os dados '+(n>1?'dessas colunas':'dessa coluna')+' serão removidos e as fórmulas ajustadas.','Sim, excluir',()=>{remap(sh,'c',rg.c1,n,'del');ui.sel=null;save();rebuildGrid()});
  },
  sortAsc(){const sh=cur();sortRows(sh,selRange().c1,'asc');save();rebuildGrid();toast('Ordenado pela coluna '+colName(selRange().c1)+'.')},
  sortDesc(){const sh=cur();sortRows(sh,selRange().c1,'desc');save();rebuildGrid();toast('Ordenado pela coluna '+colName(selRange().c1)+'.')},
  fillDown(){
    const sh=cur(),rg=selRange();let r2=rg.r2;
    if(rg.r1===rg.r2){r2=rg.r1+1;if(r2>=sh.rows){if(sh.rows>=500)return;sh.rows++}}
    for(let c=rg.c1;c<=rg.c2;c++){
      const src=sh.cells[nm([c,rg.r1])];
      for(let r=rg.r1+1;r<=r2;r++){
        const ref=nm([c,r]);
        if(!src){delete sh.cells[ref];continue}
        const cp=Object.assign({},src);
        if(typeof cp.v==='string'&&cp.v[0]==='=')cp.v='='+shiftFormula(cp.v.slice(1),r-rg.r1,0);
        sh.cells[ref]=cp;
      }
    }
    save();rebuildGrid();
  },
  toggleTot(){const sh=cur();sh.totals=!sh.totals;save();render()},
  toggleHead(){const sh=cur();sh.header=!sh.header;save();render()},
  toggleColTot(){const sh=cur(),c=selRange().c1;sh.noTot=sh.noTot||[];const i=sh.noTot.indexOf(c);if(i>=0)sh.noTot.splice(i,1);else sh.noTot.push(c);save();refreshValues();toast(i>=0?'Total ligado na coluna '+colName(c)+'.':'Total desligado na coluna '+colName(c)+'.')}
};
/* eventos da grade */
document.addEventListener('focusin',e=>{
  const t=e.target;if(!(t.classList&&t.classList.contains('cell')))return;
  const sh=cur(),r=+t.dataset.r,c=+t.dataset.c,ref=nm([c,r]);
  t.value=(sh.cells[ref]&&sh.cells[ref].v)||'';
  ui.sel={r1:r,c1:c,r2:r,c2:c};ui.anchor={r,c};
  setTimeout(()=>{try{t.select()}catch(_){}},0);
  paintSel();syncTool();
});
document.addEventListener('focusout',e=>{const t=e.target;if(t.classList&&t.classList.contains('cell'))commitCell(t)});
document.addEventListener('mousedown',e=>{
  const t=e.target;
  if(e.shiftKey&&t.classList&&t.classList.contains('cell')&&ui.anchor){
    e.preventDefault();
    ui.sel={r1:ui.anchor.r,c1:ui.anchor.c,r2:+t.dataset.r,c2:+t.dataset.c};paintSel();syncTool();
  }
});
document.addEventListener('keydown',e=>{
  const t=e.target;
  if(t.id==='fbar'&&e.key==='Enter'){e.preventDefault();t.blur();return}
  if(!(t.classList&&t.classList.contains('cell')))return;
  const r=+t.dataset.r,c=+t.dataset.c;
  const go=(rr,cc)=>{const n=document.getElementById('c-'+nm([cc,rr]));if(n){e.preventDefault();n.focus();return true}return false};
  if(e.key==='Enter'){if(!go(r+(e.shiftKey?-1:1),c)){e.preventDefault();t.blur()}}
  else if(e.key==='ArrowDown')go(r+1,c);
  else if(e.key==='ArrowUp')go(r-1,c);
  else if(e.key==='ArrowRight'&&t.selectionStart===t.value.length&&t.selectionEnd===t.value.length)go(r,c+1);
  else if(e.key==='ArrowLeft'&&t.selectionStart===0&&t.selectionEnd===0)go(r,c-1);
  else if(e.key==='Escape'){const sh=cur(),ref=nm([c,r]);t.value=(sh.cells[ref]&&sh.cells[ref].v)||'';t.blur()}
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.id==='fmtsel'){const v=t.value;applyToSel(cell=>{cell.f=v})}
  else if(t.id==='fbar'){
    const sh=cur(),rg=selRange(),ref=nm([rg.c1,rg.r1]);
    setRaw(sh,ref,t.value);save();refreshValues();
  }
});
document.addEventListener('input',e=>{
  if(e.target.id==='sfilter'){ui.sf=e.target.value;applyFilter()}
});

/* ---------- render ---------- */
const GUIDE_STEPS=[
  {view:'mais',selector:'[data-a="newAcc"]',title:'1. Cadastre suas contas',body:'Informe o nome da conta, o saldo real e a data a que ele se refere. Movimentações anteriores a essa data não alteram o saldo atual.'},
  {view:'inicio',selector:'.hero',title:'2. Entenda o saldo',body:'Este cartão soma os saldos iniciais que você cadastrou com receitas recebidas e despesas pagas. Contas pendentes entram somente na previsão.'},
  {view:'inicio',selector:'#chatform',title:'3. Anote uma movimentação',body:'Use o campo para descrever um gasto ou recebimento, ou abra o formulário. Confira a sugestão antes de salvar; os cálculos usam os dados que você confirmar.'},
  {view:'pagar',selector:'[data-a="newPend"]',title:'4. Organize vencimentos',body:'Registre contas a pagar ou valores a receber com a data correta. Ao confirmar pagamento ou recebimento, o saldo é recalculado.'},
  {view:'hist',selector:'.monthbar',title:'5. Confira o histórico',body:'Troque o mês, filtre por tipo ou pesquise para revisar o que você registrou. Os totais refletem as movimentações salvas.'},
  {view:'planilhas',selector:'[data-a="newSheet"]',title:'6. Use suas planilhas',body:'Crie um modelo vazio com fórmulas ou importe seu próprio CSV/XLSX. Os modelos não vêm preenchidos com dados fictícios.'},
  {view:'mais',selector:'.setrow',title:'7. Personalize e saia com segurança',body:'Ajuste aparência, faça uma cópia dos dados ou encerre a sessão. Cada conta de usuário tem seus próprios dados neste servidor local.'}
];
function guideAt(index){
  if(index<0){index=0}
  if(index>=GUIDE_STEPS.length){finishGuide();return}
  ui.guide=index;ui.view=GUIDE_STEPS[index].view;ui.chat=null;render();
}
function startGuide(auto){if(!S)return;guideAt(0);if(!auto)S.settings.guideSeen=false}
function finishGuide(){
  ui.guide=null;
  if(S&&S.settings){S.settings.guideSeen=true;save()}
  render();
}
function drawGuide(){
  const root=$('#guide-root');
  document.querySelectorAll('.guide-target').forEach(el=>el.classList.remove('guide-target'));
  if(ui.guide==null){root.innerHTML='';return}
  const step=GUIDE_STEPS[ui.guide];
  const target=step.selector?document.querySelector(step.selector):null;
  if(target){target.classList.add('guide-target');if(!target.dataset.guideSeen){target.dataset.guideSeen='1';target.scrollIntoView({behavior:'smooth',block:'center'})}}
  const progress=Math.round((ui.guide+1)/GUIDE_STEPS.length*100);
  root.innerHTML='<section class="guide-panel" role="region" aria-live="polite" aria-label="Assistente passo a passo"><div class="guide-head"><span class="hint">Passo '+(ui.guide+1)+' de '+GUIDE_STEPS.length+'</span><button class="btn sm" data-a="guideStop">Fechar guia</button></div><div class="guide-progress" aria-hidden="true"><span style="width:'+progress+'%"></span></div><h2>'+esc(step.title)+'</h2><p>'+esc(step.body)+'</p><div class="guide-actions"><button class="btn sm" data-a="guideBack"'+(ui.guide===0?' disabled':'')+'>Anterior</button><button class="btn primary sm" data-a="guideNext">'+(ui.guide===GUIDE_STEPS.length-1?'Concluir':'Próximo')+'</button></div></section>';
}
function render(){
  const root=document.documentElement;
  document.body.classList.toggle('hide',!!S.settings.hide);
  if(S.settings.accent&&S.settings.accent!=='azul')root.dataset.accent=S.settings.accent;else root.removeAttribute('data-accent');
  if(S.settings.theme)root.dataset.theme=S.settings.theme;
  root.style.fontSize=((S.settings.scale||1)*100)+'%';
  $('#title').textContent=VIEWS[ui.view][0];
  $('#tabs').innerHTML=NAV.map(n=>'<button data-a="go" data-v="'+n[0]+'"'+(ui.view===n[0]?' aria-current="page"':'')+'>'+ic(n[2])+'<span>'+n[1]+'</span></button>').join('');
  $('#btn-eye').innerHTML=ic(S.settings.hide?'eyeoff':'eye')+'<span>'+(S.settings.hide?'Mostrar valores':'Esconder valores')+'</span>';
  $('#banner').innerHTML='';
  document.querySelector('.page').classList.toggle('wide',ui.view==='planilhas');
  $('#view').innerHTML=VIEWS[ui.view][1]();
  if(ui.view==='planilhas')afterSheet();
  drawGuide();
}

/* ---------- events ---------- */
const A={
  go(d){ui.view=d.v;ui.chat=null;render();window.scrollTo(0,0)},
  quick(d){if(requireAccount())movForm(null,{type:d.t,status:'pago'})},
  newMov(){if(requireAccount())movForm()},
  newPend(){if(requireAccount())movForm(null,{type:ui.pt,status:'pendente'})},
  editMov(d){movForm(S.movs.find(m=>m.id===d.id))},
  delMov(d){const m=S.movs.find(x=>x.id===d.id);if(!m)return;confirmBox('Excluir este lançamento?','"'+m.desc+'" será removido e seus saldos serão recalculados.','Sim, excluir',()=>{S.movs=S.movs.filter(x=>x.id!==d.id);save();render();toast('Lançamento excluído.')})},
  done(d){markDone(d.id)},
  reopen(d){const m=S.movs.find(x=>x.id===d.id);if(m){m.status='pendente';m.due=m.due||m.date;save();render();toast('Voltou para pendente.')}},
  prevMonth(){ui.month=shiftMonth(ui.month,-1);render()},
  nextMonth(){ui.month=shiftMonth(ui.month,1);render()},
  ptype(d){ui.pt=d.v;render()},
  htype(d){ui.ht=d.v;render()},
  chatSave(){const o=ui.chat&&ui.chat.mov;if(!o)return;if(!requireAccount())return;S.movs.push(Object.assign({id:uid(),acc:defAcc()},o));ui.chat={user:ui.chat.user,kind:'saved'};save();render()},
  chatFix(){const o=ui.chat&&ui.chat.mov;if(!o)return;ui.chat=null;movForm(null,Object.assign({},o));},
  newAcc(){accForm()},
  editAcc(d){accForm(S.accounts.find(a=>a.id===d.id))},
  delAcc(d){const a=S.accounts.find(x=>x.id===d.id);const n=S.movs.filter(m=>m.acc===d.id).length;
    if(n){toast('Esta conta tem '+n+' lançamentos. Exclua ou mude esses lançamentos antes.');return}
    confirmBox('Excluir esta conta?','A conta "'+a.name+'" será removida.','Sim, excluir',()=>{S.accounts=S.accounts.filter(x=>x.id!==d.id);save();render();toast('Conta excluída.')})},
  closeModal(){closeModal()},
  overlay(d,e){if(e.target.classList.contains('overlay'))closeModal()},
  accent(d){S.settings.accent=d.v;save();render()},
  scale(d){S.settings.scale=Number(d.v);save();render()},
  theme(d){S.settings.theme=d.v;save();render()},
  toggleHide(){S.settings.hide=!S.settings.hide;save();render()},
  startGuide(){startGuide(false)},
  guideBack(){guideAt((ui.guide==null?0:ui.guide)-1)},
  guideNext(){guideAt((ui.guide==null?0:ui.guide)+1)},
  guideStop(){finishGuide()},
  logout(){logoutUser()},
  wipe(){confirmBox('Apagar seus dados?','Todas as contas, movimentações e planilhas desta conta serão removidas. Não dá para desfazer.','Sim, apagar',()=>{S.movs=[];S.accounts=[];S.sheets=[];ui.sheetId=null;save();render();toast('Seus dados foram apagados.')})},
  backup(){const txt=JSON.stringify({exportadoEm:TODAY,...S},null,2);
    try{navigator.clipboard.writeText(txt).then(()=>toast('Dados copiados. Cole em um bloco de notas para guardar.'),()=>toast('O navegador não deixou copiar.'))}catch(e){toast('O navegador não deixou copiar.')}}
};
Object.assign(A,SA);
document.addEventListener('click',e=>{
  const mode=e.target.closest('[data-auth-mode]');
  if(mode){showAuth(mode.dataset.authMode);return}
  const b=e.target.closest('[data-a]');if(!b)return;const f=A[b.dataset.a];if(f)f(b.dataset,e);
});
document.addEventListener('submit',async e=>{
  if(e.target.id==='auth-form'){
    e.preventDefault();
    const form=e.target,registering=!!form.querySelector('#auth-confirm');
    const email=form.email.value.trim(),password=form.password.value;
    if(registering&&password!==form.confirm.value){$('#auth-error').textContent='As senhas não são iguais.';form.confirm.focus();return}
    const button=$('#auth-submit');button.disabled=true;button.textContent='Aguarde…';
    try{
      const result=await apiRequest(registering?'/api/auth/register':'/api/auth/login',{method:'POST',body:JSON.stringify({email,password})});
      await enterApp(result.user);
    }catch(error){showAuth(registering?'register':'login',error.message)}
    return;
  }
  if(e.target.id==='chatform'){
    e.preventDefault();
    const txt=$('#chatin').value.trim();if(!txt)return;
    const o=understand(txt);
    ui.chat=o?{user:txt,kind:'confirm',mov:o}:{user:txt,kind:'error'};
    render();
  }
});
document.addEventListener('input',e=>{
  if(e.target.id==='hq'){ui.hq=e.target.value;const h=$('#hlist');if(h)h.innerHTML=histList()}
});
$('#btn-eye').addEventListener('click',()=>A.toggleHide());
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();if(ui.guide!=null)finishGuide()}});
initApp();
})();
