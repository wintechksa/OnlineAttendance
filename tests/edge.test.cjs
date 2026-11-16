const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {stripTypeScriptTypes}=require('node:module');
const root=path.resolve(__dirname,'..');
function server(role='employee'){
  let handler;const calls=[];
  const fetch=async(url,options)=>{calls.push({url,options});const path=new URL(url).pathname;let data=[];
    if(path.endsWith('/portal_sessions')) data=[{employee_number:'SELF-1',role,admin_number:role==='admin'?'SELF-1':null}];
    else if(new URL(url).searchParams.get('select')==='status')data=[{status:'active'}];
    else if(path.includes('/rpc/attendance_login')) data={session_token:'b'.repeat(64),role};
    return new Response(JSON.stringify(data),{status:200});
  };
  const code=stripTypeScriptTypes(fs.readFileSync(root+'/supabase/functions/attendance-portal/index.ts','utf8'),{mode:'transform'});
  vm.runInNewContext(code,{Deno:{env:{get:key=>key==='SUPABASE_URL'?'https://test.supabase.co':'server-only-secret'},serve:fn=>handler=fn},fetch,Request,Response,URL,URLSearchParams,crypto,TextEncoder,console});
  return {calls,request:async(body)=>{const response=await handler(new Request('https://test/functions/v1/attendance-portal',{method:'POST',body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};}};
}
const token='a'.repeat(64);
test('missing server token is rejected before database access',async()=>{const s=server();const r=await s.request({action:'query',table:'employee_profiles',operation:'select'});assert.equal(r.status,401);assert.equal(s.calls.length,0);});
test('employee queries enforce the server employee number and hide credential columns',async()=>{const s=server();const r=await s.request({action:'query',token,table:'employee_profiles',operation:'select',columns:'*',filters:[{column:'employee_number',value:'VICTIM'}]});assert.equal(r.status,200);const url=new URL(s.calls.at(-1).url);assert.equal(url.searchParams.getAll('employee_number').join(','),'eq.VICTIM,eq.SELF-1');assert.doesNotMatch(url.searchParams.get('select'),/password_hash|login_password|password_enc/);});
test('employee cannot change role or access admin/import tables',async()=>{for(const body of [{table:'employee_profiles',operation:'update',filters:[{column:'employee_number',value:'SELF-1'}],rows:{role:'admin'}},{table:'admin_profiles',operation:'select'},{table:'employee_import_files',operation:'delete',filters:[{column:'id',value:'1'}]}]){const s=server();assert.equal((await s.request({action:'query',token,...body})).status,403);}});
test('authenticated admin can load employee directory but receives no passwords',async()=>{const s=server('admin');const r=await s.request({action:'query',token,table:'employee_profiles',operation:'select',columns:'id,full_name,login_password,login_password_hash'});assert.equal(r.status,200);assert.equal(new URL(s.calls.at(-1).url).searchParams.get('select'),'id,full_name');});
test('unfiltered mutations and unsupported tables are rejected',async()=>{const s=server('admin');assert.equal((await s.request({action:'query',token,table:'employee_profiles',operation:'delete'})).status,400);assert.equal((await s.request({action:'query',token,table:'portal_sessions',operation:'select'})).status,403);});
test('unknown action cannot proxy arbitrary server RPCs',async()=>{const s=server();assert.equal((await s.request({action:'portal_employee_login',token})).status,400);assert.equal(s.calls.some(c=>c.url.includes('rpc/portal_employee_login')),false);});
test('CSV handles quoted fields, BOM and embedded newlines',()=>{const ctx={window:{}};vm.runInNewContext(fs.readFileSync(root+'/attendance-utils.js','utf8'),ctx);const rows=ctx.window.OAAttendance.parseCsv('\uFEFFemployee_number,full_name,notes\r\nWT-1,"Doe, Jane","Line 1\nLine ""2"""');assert.equal(rows.length,1);assert.equal(rows[0].full_name,'Doe, Jane');assert.equal(rows[0].notes,'Line 1\nLine "2"');});
test('attendance import uses Saudi timezone and validates invalid hours',()=>{const ctx={window:{}};vm.runInNewContext(fs.readFileSync(root+'/attendance-utils.js','utf8'),ctx);const api=ctx.window.OAAttendance;const rows=api.timesheets('employee_number,work_date,clock_in,clock_out\nWT-1,2026-11-16,8:00 AM,5:00 PM');assert.equal(rows[0].hours,9);assert.equal(rows[0].clock_in,'2026-11-16T08:00:00+03:00');assert.throws(()=>api.timesheets('employee_number,work_date,clock_in,clock_out\nWT-1,2026-11-16,25:00,26:00'));});
