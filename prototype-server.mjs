import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {AUCTION_MODEL,AuctionError,quoteAuction,readAuctionJSON} from './auction-service.mjs';

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.ttf':'font/ttf','.webm':'video/webm'};
const json=(res,status,value)=>{if(res.destroyed||res.writableEnded)return;return res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(value));};

export function createPrototypeServer({apiKey='',quote=quoteAuction,root=resolve('dist')}={}){
let liveRequests=0,totalCalls=0;const calls=[];
const server=createServer(async(req,res)=>{
  const port=server.address().port;
  const allowedHosts=new Set(['127.0.0.1:'+port,'localhost:'+port]);
  if(!allowedHosts.has(req.headers.host)){json(res,403,{error:'host_not_allowed'});return;}
  const origin=req.headers.origin;if(origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(origin)){json(res,403,{error:'origin_not_allowed'});return;}
  try{
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(path==='/api/auction/status'){json(res,200,{source:apiKey?'deepseek':'local',model:apiKey?AUCTION_MODEL:null});return;}
    if(path==='/api/auction'){
      if(req.method!=='POST'||!String(req.headers['content-type']).startsWith('application/json')){json(res,405,{error:'use_json_post'});return;}
      const now=Date.now();while(calls.length&&calls[0]<now-60000)calls.shift();
      if(totalCalls>=200){json(res,429,{error:'prototype_budget',message:'本次试场调用额度已用完，可以先玩组合花园。'});return;}if(liveRequests>=1||calls.length>=8){json(res,429,{error:'prototype_limit',message:liveRequests>=1?'还有一轮竞价正在完成，请稍候重试。':'一分钟内请求较多，请稍候再试。'});return;}
      // Reserve before reading the body: another request can arrive at that await.
      liveRequests++;
      const controller=new AbortController();let released=false;const release=()=>{if(!released){released=true;liveRequests--;}};const closed=()=>{if(!res.writableEnded){controller.abort();release();}};res.on('close',closed);
      try{
        const input=await readAuctionJSON(req);
        if(controller.signal.aborted||res.destroyed)return;
        calls.push(Date.now());totalCalls++;
        json(res,200,await quote(input,{apiKey,signal:controller.signal}));
      }finally{res.off('close',closed);release();}
      return;
    }
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
    const pathname=path.endsWith('/')?path+'index.html':path;
    const file=resolve(root,'.'+pathname);if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
    const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}).end(req.method==='HEAD'?undefined:bytes);
  }catch(error){if(error instanceof AuctionError){json(res,error.status,{error:error.code,message:error.message});}else{json(res,404,{error:'not_found'});}}
});
return server;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  let apiKey=process.env.DEEPSEEK_API_KEY||'';
  if(process.argv.includes('--key-stdin')){
    process.stdout.write('Ready for prototype API key on stdin (input is hidden).\n');
    apiKey=await new Promise(resolve=>{
      let input='';const raw=Boolean(process.stdin.isTTY);if(raw)process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');process.stdin.resume();
      const onData=chunk=>{if(chunk.includes('\u0003'))process.exit(130);input+=chunk;if(input.length>300){input='';finish('');return;}if(/[\r\n]/.test(input))finish(input.split(/[\r\n]/)[0].trim());};
      function finish(key){process.stdin.off('data',onData);if(raw)process.stdin.setRawMode(false);process.stdin.pause();resolve(key);}
      process.stdin.on('data',onData);
    });
  }
  const port=Number(process.env.PROTOTYPE_PORT)||4178;
  createPrototypeServer({apiKey}).listen(port,'127.0.0.1',()=>console.log(`Prototype lab: http://127.0.0.1:${port}/lab/ · buyers: ${apiKey?'DeepSeek':'local rules'}`));
}
