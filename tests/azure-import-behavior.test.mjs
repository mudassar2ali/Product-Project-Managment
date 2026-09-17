import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function module(path) {
  const source = await readFile(new URL('../' + path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
const { AzureDevOpsProvider } = await module('app/integrations/azure-devops-provider.ts');
const { formatAzureDate } = await module('app/integrations/azure-date.ts');
const provider = () => new AzureDevOpsProvider({ organization: 'example', authType: 'PAT', credential: 'test-only' });
const json = body => Response.json(body);
test('dates accept ISO timestamps and SQLite timestamps without appending a second timezone', () => {
  assert.equal(formatAzureDate('2026-09-17T12:43:41.278Z').includes('Invalid'), false);
  assert.equal(formatAzureDate('2026-09-17 12:43:41').includes('Invalid'), false);
  assert.equal(formatAzureDate('nonsense'), 'Date unavailable');
});
test('work import pages past 1000, requests full fields, preserves epic relations and detects omitted records', async t => {
  let queries = 0, batches = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.includes('/wiql')) {
      queries++;
      if (queries === 1) return json({ workItems: Array.from({length:1000}, (_,i)=>({id:i+1})) });
      assert.match(body.query, /\[System.Id\] > 1000/);
      return json({workItems:[{id:1001}]});
    }
    batches++;
    assert.equal(body.fields, undefined);
    assert.equal(body.$expand, 'Relations');
    return json({value:body.ids.map(id=>({id,rev:1,fields:{'System.Title':`Item ${id}`,'System.WorkItemType':'Epic','System.State':'New','System.IterationPath':'Project\\Sprint'},relations:[]}))});
  });
  const result = await provider().getAdvancedWorkItems('project');
  assert.equal(result.items.length,1001); assert.equal(result.complete,true); assert.equal(batches,6);
});
test('all teams contribute sprint history and shared iterations are counted once', async t => {
  t.mock.method(globalThis,'fetch',async url => url.includes('/teams?') ? json({value:[{id:'a',name:'A'},{id:'b',name:'B'}]}) : json({value:[{id:'shared',name:'Sprint',path:'Project\\Sprint',attributes:{startDate:'2026-09-01',finishDate:'2026-09-15'}}]}));
  const result = await provider().getProjectSprintHistory('project');
  assert.equal(result.iterations.length,1); assert.equal(result.complete,true); assert.equal(result.truncated,false);
});
test('Azure sign-in HTML is treated as authentication failure, not a successful JSON response', async t => {
  t.mock.method(globalThis,'fetch',async()=>new Response('<html>Sign in</html>',{status:203,headers:{'content-type':'text/html'}}));
  t.mock.method(console,'error',()=>{});
  await assert.rejects(provider().getProjects(), error=>error.status===401);
});
test('large imports write bounded batches and do not mark a failed partial write as succeeded', async () => {
  let code = await readFile(new URL('../db/azure-advanced-sync.ts', import.meta.url), 'utf8');
  code = code.replace(/import \{ env \} from "cloudflare:workers";/, 'const env = globalThis.__azureTestEnv;')
    .replace(/import \{ mappingKey \}[^;]+;/, 'const mappingKey = value => value.toLowerCase();')
    .replace(/import \{ getActiveAzureMappingMap \}[^;]+;/, 'const getActiveAzureMappingMap = async () => ({types:new Map([["epic","EPIC"]]),states:new Map([["new","PROPOSED"]])});')
    .replace(/import \{ prepareAzureSprintMetricSync \}[^;]+;/, 'const prepareAzureSprintMetricSync = async () => ({statements:[],iterationsSeen:0});');
  let batches = [], failAt = 0;
  globalThis.__azureTestEnv = { DB: {
    prepare(sql) {return {sql, bind(...values) {this.values=values;return this;}, async first(){return null;}, async all(){return {results:[]};}};},
    async batch(rows){batches.push(rows);assert.ok(rows.length<=100);if(batches.length===failAt)throw Error('simulated storage failure');return [];}
  }};
  const js = ts.transpileModule(code, { compilerOptions: { module:ts.ModuleKind.ESNext, target:ts.ScriptTarget.ES2022 } }).outputText;
  const {completeAdvancedSync} = await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
  const items = Array.from({length:220},(_,index)=>({externalId:String(index),externalRevision:'1',externalType:'Epic',externalState:'New',parentExternalId:null,title:'Epic',owner:null,storyPoints:null,remainingWork:null,blocked:false,blockedReason:null,iterationId:null,iterationPath:null,relations:[],sourceUrl:'https://dev.azure.com/example',sourceChangedAt:null}));
  const context={id:'link',projectId:'project',connectionId:'connection'};
  const source={complete:true,items,pagesRead:2,sourceRevision:'revision',retrievedAt:new Date().toISOString()};
  await completeAdvancedSync('run',context,source,null,'actor','correlation');
  assert.ok(batches.length>3);
  assert.match(batches.at(-1)[0].sql,/status='SUCCEEDED'/);
  batches=[];failAt=2;
  await assert.rejects(completeAdvancedSync('run',context,source,null,'actor','correlation'),/simulated storage failure/);
  assert.equal(batches.flat().some(row=>row.sql.includes("status='SUCCEEDED'")),false);
  delete globalThis.__azureTestEnv;
});
