const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function browser() {
  const html = read('login.html');
  const elements = {};
  function element(id) {
    const classes = new Set();
    return elements[id] = { id, value:'', disabled:false, hidden:false, style:{}, handlers:{},
      classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(c,on){if(on??!classes.has(c)) classes.add(c);else classes.delete(c);}},
      addEventListener(event, fn){(this.handlers[event] ||= []).push(fn);},
      async fire(event){for(const fn of this.handlers[event]||[]) await fn.call(this,{preventDefault(){}});},
      click(){return this.fire('click');}, focus(){}, checkValidity(){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.value);},
      querySelector(){return null;}, reset(){for(const key of Object.keys(elements))if(key.startsWith('signup'))elements[key].value='';}
    };
  }
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) element(match[1]);
  const storage = new Map(); const calls = [];
  const context = vm.createContext({ console, TextEncoder, URLSearchParams, requestAnimationFrame:fn=>fn(),
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    document:{getElementById:id=>elements[id]||null,querySelector:()=>null,querySelectorAll:()=>[]},
    window:{__OA_SUPABASE__:{},location:{search:'',pathname:'/login.html'},addEventListener(){},history:{replaceState(){}}},
    OAPortal:{request:async(action,payload)=>{calls.push({action,payload});return {session_token:'a'.repeat(64),role:'employee',employee_number:'TEST-1'};}}
  });
  const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  vm.runInContext(script,context);
  return {context,elements,storage,calls};
}
test('all inline scripts and shared scripts parse',()=>{
  for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){
    for(const m of read(file).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(m[1],{filename:file});
  }
  for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.js')))new vm.Script(read(file),{filename:file});
});
test('signup Enter advances first step without submitting hidden required fields',async()=>{
  const b=browser();b.elements.signupEmail.value='test@example.com';b.elements.signupPassword.value='strong-pass-123';
  await b.elements.signupForm.fire('submit');
  assert.equal(b.elements.signupStep2.hidden,false);assert.equal(b.calls.length,0);
});
test('signup has one submit handler, no recursive button click handler, and no credential table access',async()=>{
  const b=browser();vm.runInContext('setSignupStep(2,false)',b.context);
  for(const [id,value]of Object.entries({signupEmail:'test@example.com',signupPassword:' strong-pass-123 ',signupEmployeeNumber:'TEST-1',signupFullName:'Test User',signupMobile:'+966500000000'}))b.elements[id].value=value;
  assert.equal(b.elements.signupForm.handlers.submit.length,1);assert.equal(b.elements.signupBtn.handlers.click,undefined);
  await b.elements.signupForm.fire('submit');assert.equal(b.calls.length,1);assert.equal(b.calls[0].action,'signup');assert.equal(b.calls[0].payload.password,' strong-pass-123 ');
  assert.equal(b.elements.signupBtn.disabled,false);assert.equal(b.elements.employeeNumber.value,'TEST-1');
  assert.doesNotMatch(read('login.html'),/\.from\(["']employee_profiles|verify_admin_password/);
});
test('repeated login while pending sends one request and saves server token',async()=>{
  const b=browser();b.elements.employeeNumber.value='TEST-1';b.elements.password.value=' strong-pass-123 ';
  let complete;let count=0;b.context.OAPortal.request=async()=>{count++;return new Promise(resolve=>complete=resolve);};
  const first=b.elements.loginForm.fire('submit');await b.elements.loginForm.fire('submit');assert.equal(count,1);
  complete({session_token:'b'.repeat(64),employee_number:'TEST-1',role:'employee'});await first;
  const session=JSON.parse(b.storage.get('oa_supabase_session'));assert.equal(session.sessionToken,'b'.repeat(64));assert.equal(session.password,undefined);
  assert.equal(b.context.window.location.href,'./timesheet-view.html');
});
test('failed login displays real error and restores button',async()=>{
  const b=browser();b.elements.employeeNumber.value='TEST-1';b.elements.password.value='wrong';
  b.context.OAPortal.request=async()=>{throw new Error('Invalid username/email or password.');};
  await b.elements.loginForm.fire('submit');assert.equal(b.elements.modalMessage.textContent,'Invalid username/email or password.');assert.equal(b.elements.loginBtn.disabled,false);assert.equal(b.storage.size,0);
});
test('temporary password redirects to password change',async()=>{
  const b=browser();b.elements.employeeNumber.value='TEST-1';b.elements.password.value='temporary-pass';
  b.context.OAPortal.request=async()=>({session_token:'c'.repeat(64),role:'admin',employee_number:'TEST-1',must_change_password:true});
  await b.elements.loginForm.fire('submit');assert.equal(b.context.window.location.href,'./employee-profile.html');
});
test('server source never exposes passwordless login and enforces identity on queries',()=>{
  const source=read('supabase/functions/attendance-portal/index.ts');
  assert.doesNotMatch(source,/rpc\('portal_employee_login'/);
  assert.match(source,/const session = await identity\(body.token\)/);
  assert.match(source,/if \(!admin\) params.append\('employee_number', 'eq\.' \+ session.employee_number\)/);
  assert.match(read('attendance-auth.sql'),/security invoker/g);
});
