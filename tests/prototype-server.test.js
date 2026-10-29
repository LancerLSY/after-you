import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {once} from 'node:events';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {createPrototypeServer} from '../prototype-server.mjs';
import {AuctionError,validateAuctionPayload,localAuctionQuote} from '../auction-service.mjs';

const payload=()=>({round:1,seed:42,item:{id:'brick',name:'半块砖',traits:['能垫桌脚']},pitch:'垫平你的桌子，陪你一起工作。',bidders:['detective','collector','robot'],target:'detective',history:[],activeRule:null});
const quoteResult=()=>({source:'local',bids:['detective','collector','robot'].map(id=>({id,bid:100,reason:'测试报价。'})),twist:{title:'收藏热潮',description:'下一件翻倍。',tag:'collector_double'},roundTotal:300});
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}

async function start(t,quote=async()=>quoteResult()){
  const server=createPrototypeServer({quote});
  t.after(async()=>{server.closeAllConnections();if(server.listening)await new Promise(resolve=>server.close(resolve));});
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  return server;
}

function open(server,{method='POST',path='/api/auction',headers={}}={}){
  let req;
  const reply=new Promise((resolve,reject)=>{
    req=request({hostname:'127.0.0.1',port:server.address().port,path,method,headers:{'Content-Type':'application/json',...headers}},res=>{
      const chunks=[];
      res.on('data',chunk=>chunks.push(chunk));
      res.on('error',reject);
      res.on('end',()=>{try{resolve({status:res.statusCode,data:JSON.parse(Buffer.concat(chunks).toString('utf8'))});}catch(error){reject(error);}});
    });
    req.on('error',reject);
    req.setTimeout(3000,()=>req.destroy(new Error('Local HTTP test timed out.')));
  });
  // Tests may deliberately destroy a request before they await its rejection.
  reply.catch(()=>{});
  return{req,reply};
}

function post(server,body=payload(),options={}){
  const exchange=open(server,options);
  exchange.req.end(typeof body==='string'?body:JSON.stringify(body));
  return exchange.reply;
}

test('a slow request reserves the only slot before its body finishes', {timeout:5000}, async t=>{
  let calls=0;
  const server=await start(t,async()=>{calls++;return quoteResult();});
  const bytes=Buffer.from(JSON.stringify(payload()));
  const first=open(server);
  const arrived=once(server,'request');
  first.req.write(bytes.subarray(0,1));
  await arrived;
  const second=await post(server);
  assert.equal(second.status,429);
  assert.equal(second.data.error,'prototype_limit');
  assert.equal(calls,0,'an unfinished body has not reached the provider');
  first.req.end(bytes.subarray(1));
  assert.equal((await first.reply).status,200);
  assert.equal(calls,1);
  assert.equal((await post(server)).status,200,'normal completion frees the reservation');
  assert.equal(calls,2);
});

test('only one upstream quote can run at a time', {timeout:5000}, async t=>{
  const entered=deferred(),finish=deferred();
  let active=0,maxActive=0,calls=0;
  const server=await start(t,async()=>{
    calls++;active++;maxActive=Math.max(maxActive,active);entered.resolve();
    try{await finish.promise;return quoteResult();}finally{active--;}
  });
  const first=post(server);
  await entered.promise;
  const second=await post(server);
  assert.equal(second.status,429);
  assert.match(second.data.message,/正在完成/);
  assert.equal(calls,1);
  finish.resolve();
  assert.equal((await first).status,200);
  assert.equal((await post(server)).status,200);
  assert.equal(maxActive,1);
});

test('cancel releases the slot, aborts upstream, and late cleanup never releases a newer quote', {timeout:5000}, async t=>{
  const enteredFirst=deferred(),aborted=deferred(),finishAborted=deferred();
  const enteredSecond=deferred(),finishSecond=deferred();
  let calls=0;
  const server=await start(t,async(_, {signal})=>{
    calls++;
    if(calls===1){
      enteredFirst.resolve();
      return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{
        aborted.resolve();
        finishAborted.promise.then(()=>reject(new AuctionError('request_canceled','Canceled.',499)));
      },{once:true}));
    }
    if(calls===2){enteredSecond.resolve();await finishSecond.promise;}
    return quoteResult();
  });
  const first=open(server);first.req.end(JSON.stringify(payload()));
  await enteredFirst.promise;
  const rejected=assert.rejects(first.reply);
  first.req.destroy();
  await rejected;await aborted.promise;
  const second=post(server);
  await enteredSecond.promise;
  finishAborted.resolve();
  await nextTurn();
  const blocked=await post(server);
  assert.equal(blocked.status,429,'the aborted handler must not decrement the second quote’s slot');
  assert.equal(calls,2);
  finishSecond.resolve();
  assert.equal((await second).status,200);
  assert.equal((await post(server)).status,200);
  assert.equal(calls,3);
});

test('cancel during a partial upload releases its reservation without calling upstream', {timeout:5000}, async t=>{
  let calls=0;
  const server=await start(t,async()=>{calls++;return quoteResult();});
  const first=open(server);
  const arrived=once(server,'request');
  first.req.write('{');
  const [,res]=await arrived;
  const closed=once(res,'close');
  const rejected=assert.rejects(first.reply);
  first.req.destroy();
  await rejected;await closed;
  assert.equal((await post(server)).status,200);
  assert.equal(calls,1);
});

test('Host and Origin restrictions reject requests before reaching a quote', {timeout:5000}, async t=>{
  let calls=0;
  const server=await start(t,async()=>{calls++;return quoteResult();});
  const port=server.address().port;
  const badHost=await post(server,payload(),{headers:{Host:'untrusted.example:'+port}});
  assert.equal(badHost.status,403);
  assert.equal(badHost.data.error,'host_not_allowed');
  for(const origin of ['https://untrusted.example','null','http://localhost:'+(port+1)]){
    const blocked=await post(server,payload(),{headers:{Origin:origin}});
    assert.equal(blocked.status,403);
    assert.equal(blocked.data.error,'origin_not_allowed');
  }
  assert.equal(calls,0);
  const allowed=await post(server,payload(),{headers:{Host:'localhost:'+port,Origin:'http://localhost:'+port}});
  assert.equal(allowed.status,200);
  assert.equal(calls,1);
  const status=open(server,{method:'GET',path:'/api/auction/status'});status.req.end();
  assert.deepEqual(await status.reply,{status:200,data:{source:'local',model:null}});
});

test('bad JSON frees its slot and the minute call limit remains enforced', {timeout:5000}, async t=>{
  let calls=0;
  const server=await start(t,async()=>{calls++;return quoteResult();});
  assert.equal((await post(server,'{')).status,400);
  assert.equal((await post(server,'x'.repeat(12001))).status,413);
  assert.equal(calls,0);
  for(let index=0;index<8;index++)assert.equal((await post(server)).status,200);
  const limited=await post(server);
  assert.equal(limited.status,429);
  assert.equal(limited.data.error,'prototype_limit');
  assert.match(limited.data.message,/一分钟/);
  assert.equal(calls,8);
});

test('HTTP accepts a split UTF-8 body with 300 Unicode code points and null-winner history', {timeout:5000}, async t=>{
  let received;
  const server=await start(t,async input=>{received=validateAuctionPayload(input);return localAuctionQuote(received);});
  const body={...payload(),round:2,pitch:'中'.repeat(200)+'🙂'.repeat(100),history:[{round:1,winnerId:null,winningBid:0}]};
  const bytes=Buffer.from(JSON.stringify(body));
  const split=bytes.indexOf(Buffer.from('中'))+1;
  const exchange=open(server);
  const arrived=once(server,'request');
  exchange.req.write(bytes.subarray(0,split));
  await arrived;await nextTurn();
  exchange.req.end(bytes.subarray(split));
  const result=await exchange.reply;
  assert.equal(result.status,200);
  assert.equal(result.data.source,'local');
  assert.equal(received.pitch,body.pitch);
  assert.equal([...received.pitch].length,300);
  assert.deepEqual(received.history,[{round:1,winnerId:null,winningBid:0}]);
});
