'use strict';
const $ = id => document.getElementById(id);
const API=(window.MONITOR_API||'').replace(/\/$/,'');
let accessToken='';
try{accessToken=sessionStorage.getItem('monitor-session')||'';}catch(e){}
function saveToken(value){accessToken=value;try{if(value)sessionStorage.setItem('monitor-session',value);else sessionStorage.removeItem('monitor-session');}catch(e){}}
function apiFetch(path,options={}){return fetch(API+path,{...options,headers:{...(accessToken?{Authorization:'Bearer '+accessToken}:{}),...options.headers}});}
function setLocked(locked){
  $('login-panel').hidden=!locked;$('main').hidden=locked;$('export').hidden=locked;document.querySelector('nav').hidden=locked;$('logout').hidden=!API||locked;
  if(locked){$('connection').className='badge neutral';$('connection').textContent='密码保护';}
}
const escapeHTML = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = (v, digits=0) => v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('zh-CN',{maximumFractionDigits:digits});
const ms = v => v == null ? '—' : number(v,1)+' ms';
const percent = v => v == null ? '—' : number(v,1)+'%';
const date = t => t ? new Date(t*1000).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}) : '尚未采集';
const clock = t => new Date(t*1000).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
const fullDate = t => t ? new Date(t*1000).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}) : '待读取';
const bytes = (v, digits=1) => {
  if (v == null) return '—';
  const i = Math.min(4,Math.max(0,Math.floor(Math.log(Math.max(1,v))/Math.log(1024))));
  return number(v/1024**i,digits)+' '+['B','KiB','MiB','GiB','TiB'][i];
};
const median = values => { const a=values.filter(v=>v!=null && Number.isFinite(v)).sort((a,b)=>a-b); return a.length ? (a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2 : null; };
const badge = (text,kind='neutral') => `<span class="badge ${kind}">${escapeHTML(text)}</span>`;
const cities = {Guangzhou:'广州',Nanjing:'南京',Guilin:'桂林',Beijing:'北京',Shanghai:'上海',Changsha:'长沙',Nanning:'南宁',Kunming:'昆明',Taishan:'台山',Wuhan:'武汉',Wuhu:'芜湖',Chengdu:'成都',Wuxi:'无锡',Hangzhou:'杭州',Ningbo:'宁波',Shenzhen:'深圳',Tianjin:'天津',Yangzhou:'扬州','Xi\'an':'西安',Zhenjiang:'镇江'};
const names = {'monopoly.gege':'GEGE 大富翁','hqclub-ootd':'黑裙 OOTD','kcm-club-monopoly':'KCM 大富翁','ydkclub-ootd':'有点困 OOTD','cywclub-ootd':'吃一碗 OOTD','hailiclub-monopoly':'海狸大富翁','mikaclub-kitchen':'咪咔御膳房','manmiao-octevent':'曼喵国庆活动','wugangclub':'雾港电竞','fuxingclub-flyingchess':'福星飞行棋','fuxingclub-travel':'福星小羊出游记','xiaojin-wheel':'小津反馈转盘'};
const siteName = host => names[host.replace('.akihowaito.cn','')] || host;
let state = null, hours = 24, toastTimer, loading = false, lastChina = '', lastSystem = '';

function toast(text){ $('toast').textContent=text; $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').hidden=true,5000); }
function message(id,text){ $(id).hidden=!text; $(id).textContent=text||''; }
function stale(kind){ const item=state?.[kind]; return !item?.at || state.now-item.at > Math.max(state.intervals[kind]*2,90); }

function renderResources(){
  const m=state.metrics;
  if(!m?.memory){ $('resources').innerHTML=`<div class="empty">${escapeHTML(m?.lastError || '等待 SSH 资源采集。首次 CPU 与吞吐数值需要两次采样。')}</div>`; return; }
  const mem=m.memory, disk=m.disk;
  const rows=[
    ['CPU 使用率',`${m.cores} vCPU`,m.cpu==null?'采样中':number(m.cpu,1),m.cpu==null?'':'%',m.cpu,`1 分钟负载 ${number(m.load[0],2)} · ${m.cores} 核`],
    ['内存使用率','扣除可回收缓存',number(mem.used/mem.total*100,1),'%',mem.used/mem.total*100,`${bytes(mem.used)} / ${bytes(mem.total)}`],
    ['系统磁盘','根目录 /',number(disk.used/disk.total*100,1),'%',disk.used/disk.total*100,`可用 ${bytes(disk.free)} · 总计 ${bytes(disk.total)}`],
    ['网络吞吐','接收 / 发送',bytes(m.rxRate),'/s',null,`发送 ${bytes(m.txRate)}/s · 30 秒区间均值`]
  ];
  $('resources').innerHTML=rows.map(r=>`<div class="resource"><div class="resource-label"><span>${r[0]}</span><span>${r[1]}</span></div><div class="value">${r[2]}<small>${r[3]}</small></div>${r[4]!=null?`<progress class="meter" value="${r[4]}" max="100" aria-label="${r[0]}"></progress>`:''}<div class="resource-note">${r[5]}</div></div>`).join('');
}

function renderHealth(){
  if(state.health){
    const h=state.health,c=h.counts||{};
    $('overall').className='badge '+h.level;
    $('overall').textContent=h.label;
    $('health-summary').innerHTML=`<div class="health-reading"><strong>${h.level==='good'?'当前运行平稳':h.level==='neutral'?'正在收集数据':'先看这些需要处理的地方'}</strong><span>${c.good||0} 个网站良好 · ${(c.warn||0)+(c.bad||0)} 个需处理 · ${c.paused||0} 个已暂停</span></div>`;
    $('alerts').hidden=!h.issues.length;
    $('alerts').innerHTML=h.issues.map(r=>`<div class="health-issue">${badge(r.level==='bad'?'异常':'关注',r.level)}<div><strong>${escapeHTML(r.title)}</strong><p>${escapeHTML(r.advice)}</p></div></div>`).join('');
    $('connection').className='badge '+(stale('metrics')||state.metrics?.lastError?'warn':'good');
    $('connection').textContent=stale('metrics')?'采集等待 / 过期':state.metrics?.lastError?'采集异常':'实时采集中';
    $('last-updated').textContent='资源更新 '+date(state.metrics?.at);
    return;
  }
  const m=state.metrics, sites=state.sites?.rows || [];
  const bad=sites.filter(r=>!r.ok), issues=[];
  if (m?.lastError) issues.push(m.lastError);
  else if(stale('metrics')) issues.push('服务器资源数据已过期，等待下一次成功采集');
  if(m?.warnings?.length)issues.push(...m.warnings);
  if(state.sites?.lastError)issues.push('网站采集异常：'+state.sites.lastError);
  else if(state.sites?.at && stale('sites'))issues.push('网站检测结果已过期，需要重新检查');
  if(bad.length) issues.push(`${bad.length} 个网站入口检测异常：${bad.map(r=>r.host).join('、')}`);
  if(sites.some(r=>r.certificate?.days!=null && r.certificate.days<14)) issues.push('有 HTTPS 证书将在 14 天内到期');
  if(m?.cpu>85) issues.push('CPU 使用率超过 85%');
  if(m?.memory?.used/m?.memory?.total>.9) issues.push('内存使用率超过 90%');
  if(m?.disk?.used/m?.disk?.total>.85) issues.push('磁盘使用率超过 85%');
  if(m?.services?.some(r=>r.state==='failed')) issues.push('有后台服务运行失败');
  $('overall').className='badge '+(issues.length?'warn':(!m?.at || !state.sites?.at?'neutral':'good'));
  $('overall').textContent=issues.length?`${issues.length} 项需要关注`:(!state.sites?.at?'正在检查网站':'服务器与网站检查正常');
  $('connection').className='badge '+(stale('metrics')||m?.lastError?'warn':'good');
  $('connection').textContent=stale('metrics')?'采集等待 / 过期':m?.lastError?'采集异常':'正在采集';
  $('last-updated').textContent='资源更新 '+date(m?.at);
  message('alerts',issues.join('；'));
}

function runtime(seconds){
  if(seconds==null)return '未运行';
  const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60);
  return days?`${days} 天 ${hours} 小时`:hours?`${hours} 小时 ${minutes} 分钟`:`${minutes} 分钟`;
}

function renderTraffic(){
  const n=state.network||{},t=state.traffic||{},rows=Object.values(t.rows||{});
  const total=rows.some(r=>r.bytes!=null)?rows.reduce((sum,r)=>sum+(r.bytes||0),0):null;
  const requests=rows.some(r=>r.requests!=null)?rows.reduce((sum,r)=>sum+(r.requests||0),0):null;
  const coverage=n.count?Math.min(100,(n.seconds||0)/(hours*3600)*100):null;
  $('traffic-caption').textContent=`最近 ${hours===168?'7 天':hours+' 小时'} · 与下方时间范围同步`;
  $('network-stats').innerHTML=[
    ['服务器接收',n.count?bytes(n.received):'等待采样','实际网卡接收量'],
    ['服务器发送',n.count?bytes(n.sent):'等待采样',`发送峰值 ${n.peakTx==null?'—':number(n.peakTx*8/1000000,2)+' Mbps'}`],
    ['网站 HTTP 发送',bytes(total),requests==null?'等待开启计量':number(requests)+' 次请求'],
    ['网卡采样覆盖',coverage==null?'等待采样':percent(coverage),'缺少的时间不补成 0']
  ].map(([label,value,note])=>`<div><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('');
  $('accounting-start').textContent=t.since?`网站流量开始记录于 ${date(t.since)}。发送量为响应内容，不含传输协议开销。`:'网站流量尚未开始记录；开启后逐步形成真实统计。';
  if(state.metrics?.accounting?.pending)$('accounting-start').textContent+=' 正在补录积压日志，本轮统计尚未齐全。';
  if(state.metrics?.accounting?.error)$('accounting-start').textContent+=' '+state.metrics.accounting.error+'。';
}

function pointLabel(row){ return escapeHTML(cities[row.city]||row.city||'城市未标注')+' · '+escapeHTML(row.operator); }
function renderChina(){
  const c=state.china;
  message('china-error',c?.lastError || (c?.at && stale('china')?'当前显示上次检测结果，数据已过期，请重新检测。':''));
  $('china-stamp').textContent=state.running.china?'探测进行中，保留上次结果':c?.at?'检测于 '+date(c.at):'等待首次检测';
  if(!c?.rows) return;
  const key=JSON.stringify(c);
  if(key===lastChina)return;
  lastChina=key;
  const http=c.rows.filter(r=>r.type==='http'), ping=c.rows.filter(r=>r.type==='ping');
  $('china-caption').textContent=`实际检测：https://${c.target}${c.path||'/'} · 每 30 分钟检测`;
  $('china-summary').innerHTML=['电信','联通','移动'].map(op=>{
    const h=http.filter(r=>r.operator===op),p=ping.filter(r=>r.operator===op),good=h.filter(r=>r.ok);
    const total=median(good.map(r=>r.timings.total)),rtt=median(p.filter(r=>r.ok).map(r=>r.stats.avg));
    const quality=!h.length?'无节点':good.length<h.length?'部分异常':total>1000?'请求偏慢':'请求可达';
    const sent=p.reduce((n,r)=>n+(r.stats?.total||0),0),lost=p.reduce((n,r)=>n+(r.stats?.drop||0),0);
    return `<article class="carrier"><div class="carrier-title"><h3>中国${op}</h3>${badge(quality,!h.length?'neutral':good.length<h.length?'bad':total>1000?'warn':'good')}</div><div class="carrier-data"><div><strong>${number(total)}<small>ms</small></strong><label>HTTP 总耗时中位数</label></div><div><strong>${number(rtt,1)}<small>ms</small></strong><label>Ping 中位数</label></div></div><p>HTTP 成功 ${good.length}/${h.length} · Ping 丢包 ${sent?percent(lost/sent*100):'—'}</p><p>${h.map(r=>escapeHTML(cities[r.city]||r.city)).join('、')||'本轮无可用城市'}</p></article>`;
  }).join('');
  $('http-rows').innerHTML=http.length?http.map(r=>`<tr><td><details><summary><strong>${pointLabel(r)}</strong></summary><p>${escapeHTML(r.network)} · AS${r.asn}<br>响应 IP：${escapeHTML(r.ip||'未解析')}<br>测量 ID：${escapeHTML(r.measurementId)}<br>TLS：${r.tls?.authorized?'验证通过':'未确认'}${r.error?'<br>错误：'+escapeHTML(r.error):''}</p></details></td><td>${badge(r.ok?(r.code>=300?'跳转 '+r.code:'HTTP '+r.code):(r.code?'HTTP '+r.code:'失败'),r.ok?(r.code>=300?'warn':'good'):'bad')}</td>${['dns','tcp','tls','firstByte','download','total'].map(k=>`<td class="numeric ${r.timings?.[k]>1000?'slow':''}">${number(r.timings?.[k])}</td>`).join('')}</tr>`).join(''):'<tr><td colspan="8" class="empty">本轮未获得 HTTP 节点，不能判断网站可用性。</td></tr>';
  $('ping-rows').innerHTML=ping.length?ping.map(r=>`<tr><td><strong>${pointLabel(r)}</strong><small>AS${r.asn}</small></td><td>${ms(r.stats?.avg)}</td><td>${number(r.stats?.min,1)} / ${number(r.stats?.max,1)} ms</td><td class="${r.stats?.loss>0?'failed':''}">${percent(r.stats?.loss)}</td><td>${number(r.stats?.rcv)} / ${number(r.stats?.total)}</td><td>${badge(!r.ok?'无有效回应':r.stats.loss>0?'有丢包':r.stats.avg>150?'延迟偏高':'本轮稳定',!r.ok?'bad':r.stats.loss>0||r.stats.avg>150?'warn':'good')}</td></tr>`).join(''):'<tr><td colspan="6" class="empty">本轮未获得 Ping 节点，不能判断 IP 线路。</td></tr>';
}

function renderChinaHistory(){
  $('china-history').innerHTML=state.chinaHistory?.length?[...state.chinaHistory].reverse().map(r=>`<div class="history-row"><span>${date(r.at)} · ${escapeHTML(r.target)}</span><span>HTTP 成功 ${r.success}/${r.count} 个节点</span></div>`).join(''):'<p class="empty">还没有已完成的国内检测记录。</p>';
}

function sampleCell(stat){
  if(!stat?.count)return '—';
  return `<strong>${percent(stat.success)}</strong><small>${stat.count} 次检查 · 从 ${date(stat.since).slice(0,-3)}</small>`;
}

function renderSites(){
  const s=state.sites;
  $('site-source').textContent='资源每 30 秒更新 · 文件与部署每 5 分钟更新 · '+(s?.source||'等待检测来源');
  message('sites-error',s?.lastError || (s?.at && stale('sites')?'网站检测数据已过期，当前显示上次结果。':''));
  $('sites-stamp').textContent=state.running.sites?'正在逐个检测…':s?.at?'检测于 '+date(s.at):'等待检测';
  if(!s?.rows)return;
  $('site-count').textContent=s.rows.length+' 个网站';
  const q=$('site-search').value.toLowerCase(),only=$('only-issues').checked;
  const rows=s.rows.filter(r=>(r.host+' '+siteName(r.host)).toLowerCase().includes(q) && (!only || ['warn','bad'].includes(r.health?.level)));
  const open=new Set([...document.querySelectorAll('.app-row[open]')].map(el=>el.dataset.host));
  const focused=document.activeElement?.tagName==='SUMMARY'?document.activeElement.closest('.app-row')?.dataset.host:null;
  const meter=(value,label)=>value==null?'':`<progress class="meter app-meter" max="100" value="${Math.max(0,Math.min(100,value))}" aria-label="${escapeHTML(label)}"></progress>`;
  $('site-rows').innerHTML=rows.length?rows.map((r,index)=>{
    const a=r.resource||{},traffic=r.traffic||{},h=r.health||{level:r.ok?'good':'bad',label:r.ok?'可达':'异常',issues:[]};
    const memoryShare=a.memory==null?null:100*a.memory/state.metrics.memory.total;
    const diskShare=a.diskBytes==null?null:100*a.diskBytes/state.metrics.disk.total;
    const elapsed=a.uptime==null?null:a.uptime+Math.max(0,state.now-(state.metrics?.at||state.now));
    const version=a.version|| (a.fingerprint?'文件指纹 '+a.fingerprint:'版本待读取');
    const cells=[
      ['CPU',r.paused?'已暂停':r.shared?'共享 Caddy':percent(a.cpu),r.shared?'无法单独拆分':'占整台服务器',r.paused?null:a.cpu],
      ['内存',r.paused?'已暂停':r.shared?'共享 Caddy':bytes(a.memory),r.shared?'无法单独拆分':percent(memoryShare)+' 整机',r.paused?null:memoryShare],
      ['文件用量',bytes(a.diskBytes),a.diskError||percent(diskShare)+' 磁盘',diskShare],
      ['HTTP 发送',bytes(traffic.bytes),traffic.requests==null?'等待计量':number(traffic.requests)+' 次请求',null],
      ['源站响应',r.paused?'已暂停':r.ok?ms(r.total):'未响应',r.paused?'按要求暂停':r.ok?'首字节 '+ms(r.ttfb):'检查服务状态',null],
      ['连续运行',r.paused?'已暂停':r.shared?'共享服务':runtime(elapsed),r.shared?'无独立进程':a.restarts==null?'等待读取':'自动重启 '+a.restarts+' 次',null]
    ];
    const facts=[['部署参考依据','文件系统的目录创建记录，不等同于首次上线时间'],['当前部署版本',version],['页面文件指纹',a.fingerprint||'未获得'],['服务启动时间',r.shared?'与 Caddy 共享，不能代表本站上线时间':a.startedAt?fullDate(a.startedAt):'服务已停止'],['文件统计时间',a.metadataAt?fullDate(a.metadataAt):'待读取'],['HTTPS 证书',r.certificate?.days==null?'未获取':r.certificate.days+' 天后到期 · '+date(r.certificate.expires)],['实际响应地址',r.ip||'未获得'],['近 '+(hours===168?'7 天':hours+' 小时')+' 95% 请求耗时',traffic.p95Over20s?'超过 20 秒':traffic.p95==null?'还没有请求样本':'≤ '+ms(traffic.p95)],['服务器报错比例',traffic.errorRate==null?'还没有请求样本':percent(traffic.errorRate)],['24 小时探测成功率',r.paused?'暂停中，不作故障评价':r['24h']?.count?percent(r['24h'].success)+' · '+r['24h'].count+' 次':'暂无样本'],['7 天探测成功率',r.paused?'暂停中，不作故障评价':r['7d']?.count?percent(r['7d'].success)+' · '+r['7d'].count+' 次':'暂无样本']];
    return `<details class="app-row" data-host="${escapeHTML(r.host)}" ${open.has(r.host)?'open':''}><summary><div class="app-heading"><div><strong>${escapeHTML(r.name||siteName(r.host))}</strong><span class="hostname">${escapeHTML(r.host)}</span></div>${badge(h.label,h.level==='paused'?'neutral':h.level)}</div><div class="app-metrics">${cells.map(([label,value,note,bar])=>`<div><span>${label}</span><strong>${value}</strong>${meter(bar,label)}<small>${escapeHTML(note)}</small></div>`).join('')}</div><div class="app-summary-end"><span>${a.updatedAt?'更新 '+date(a.updatedAt).slice(0,-3):'部署记录读取中'}</span><span>查看部署、版本与完整指标</span></div></summary><div class="app-detail"><div class="app-evaluation">${h.issues.length?h.issues.map(i=>`<p><strong>${escapeHTML(i.title)}</strong> · ${escapeHTML(i.advice)}</p>`).join(''):r.paused?'按要求暂停，程序与数据库保留。':h.level==='neutral'?'检测数据尚未齐全，暂不作健康结论。':'当前已完成的检查没有发现需要处理的项目。'}${r.note?'<p>'+escapeHTML(r.note)+'</p>':''}</div><div class="deployment-line"><div><span>部署时间参考 · 本机目录创建</span><strong>${fullDate(a.deployedAt)}</strong></div><div><span>最近文件更新</span><strong>${fullDate(a.updatedAt)}</strong></div></div><dl class="app-facts">${facts.map(([label,value])=>`<div><dt>${label}</dt><dd>${escapeHTML(value)}</dd></div>`).join('')}</dl><div class="app-chart-head"><h3>CPU 与内存变化</h3><div class="legend"><span class="cpu">CPU</span><span class="memory">内存</span></div><span>占整机比例 · 与所选时间范围同步</span></div><div id="app-chart-${index}" class="chart app-chart"></div><div class="app-chart-grid"><div><div class="app-chart-head"><h3>源站响应趋势</h3><span>每 5 分钟探测 · 非完整页面加载</span></div><div id="app-latency-${index}" class="chart"></div></div><div><div class="app-chart-head"><h3>网站发送流量</h3><span>HTTP 响应内容 · 按小时汇总</span></div><div id="app-traffic-${index}" class="chart"></div></div></div><div class="app-probe-details"><strong>这次源站探测</strong><span>DNS ${ms(r.dns)} · TCP ${ms(r.tcp)} · TLS ${ms(r.tls)} · 跳转 ${number(r.redirects)} 次</span></div><div class="app-actions"><a href="https://${escapeHTML(r.host)}" target="_blank" rel="noreferrer">打开网站</a><button type="button" data-china-host="${escapeHTML(r.host)}" ${r.paused||state.running.china?'disabled':''}>测这个网站的国内延迟</button></div><div class="app-services">${(a.units||[]).map(u=>`<div><span>${escapeHTML(u.name)}</span>${badge(u.state==='active'?'运行中':r.paused?'已暂停':'未运行',u.state==='active'?'good':r.paused?'neutral':'warn')}<small>运行 ${runtime(u.uptime)} · 内存 ${bytes(u.memory)} · 自动重启 ${u.restarts??'—'} 次</small></div>`).join('')}</div></div></details>`;
  }).join(''):'<p class="empty">没有符合筛选条件的网站。</p>';
  rows.forEach((r,index)=>{
    const detail=document.querySelector(`.app-row[data-host="${r.host}"]`);
    const chart=()=>{
      if(!detail.open)return;
      drawChart('app-latency-'+index,['latency'],'ms',null,(r.trend||[]).map(p=>({at:p.at,latency:p.ok?p.total:null})));
      drawTrafficChart('app-traffic-'+index,r.traffic?.timeline||[]);
      if(r.paused||r.shared){$('app-chart-'+index).innerHTML=`<p class="empty">${r.paused?'网站已暂停，不产生运行中的服务用量。':'静态网站共享 Caddy，不能单独拆分 CPU 和内存曲线。'}</p>`;return;}
      const points=(state.history||[]).map(p=>({at:p.at,gapBefore:p.gapBefore,cpu:p.applications?.[r.host]?.cpu,memory:p.applications?.[r.host]?.memory==null?null:100*p.applications[r.host].memory/state.metrics.memory.total}));
      drawChart('app-chart-'+index,['cpu','memory'],'%',null,points);
    };
    detail.addEventListener('toggle',chart);chart();
    if(focused===r.host)detail.querySelector('summary').focus({preventScroll:true});
  });
}

function drawChart(id,keys,unit,maxValue,customPoints=null){
  let all=customPoints||state.history||[];
  if(customPoints){const first=all.findIndex(r=>keys.some(k=>r[k]!=null));if(first>=0)all=all.slice(first);}
  const points=all.filter(r=>keys.some(k=>r[k]!=null));
  if(!points.length){ $(id).innerHTML='<div class="empty">还需要下一次采样，曲线将在真实数据到达后出现。</div>';return; }
  const w=$(id).clientWidth,h=174,right=12,top=13,bottom=27;
  const start=all[0].at,end=all[all.length-1].at,span=Math.max(end-start,30);
  const max=maxValue||Math.max(unit==='%'||unit==='ms'?1:1024,...points.flatMap(r=>keys.map(k=>r[k]||0)))*1.15;
  const tick=v=>unit==='%'?number(v,max<10?1:0)+'%':unit==='ms'?ms(v):bytes(v,0);
  const left=Math.max(49,...Array.from({length:4},(_,i)=>tick(max*i/3).length*7+14));
  const x=t=>left+(t-start)/span*(w-left-right),y=v=>h-bottom-v/max*(h-top-bottom);
  let content='';
  for(let i=0;i<4;i++){ const v=max*i/3,yy=y(v);content+=`<line class="grid" x1="${left}" x2="${w-right}" y1="${yy}" y2="${yy}"/><text x="${left-7}" y="${yy+4}" text-anchor="end">${tick(v)}</text>`; }
  keys.forEach((k,index)=>{
    let paths=[],segment=[];
    for(const p of all){if(p[k]==null || p.gapBefore){if(segment.length)paths.push(segment);segment=[];}
      if(p[k]!=null)segment.push([x(p.at),y(p[k]),p]);}
    if(segment.length)paths.push(segment);
    const letter=index?'b':'a';
    for(const path of paths){content+=`<path class="trace line-${letter}" d="${path.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ')}"/>`;}
    for(const p of points.filter(p=>p[k]!=null)){content+=`<circle class="dot-${letter}" cx="${x(p.at)}" cy="${y(p[k])}" r="${points.length<20?2.8:1.8}"><title>${clock(p.at)} · ${k}: ${unit==='%'?percent(p[k]):unit==='ms'?ms(p[k]):bytes(p[k])+'/s'}</title></circle>`;}
  });
  content+=`<text x="${left}" y="${h-4}">${clock(start)}</text><text x="${w-right}" y="${h-4}" text-anchor="end">${clock(end)}</text>`;
  $(id).innerHTML=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${unit==='%'?'CPU 与内存使用率':unit==='ms'?'网站源站响应趋势':'网络接收与发送吞吐'}，${points.length} 个采样点">${content}</svg>`;
}

function drawTrafficChart(id,points){
  if(!points.length){$(id).innerHTML=`<p class="empty">${state.traffic?.since?'计量已开启，当前还没有请求记录。':'启用流量计量后，按实际请求逐步形成趋势。'}</p>`;return;}
  const w=$(id).clientWidth,h=174,left=72,right=12,top=15,bottom=27;
  const maximum=Math.max(1,...points.map(p=>p.bytes))*1.12;
  const start=points[0].at,end=points[points.length-1].at+3600;
  const step=(w-left-right)*3600/(end-start),bar=Math.min(38,step*.65);
  let markup='';
  for(let i=0;i<3;i++){const value=maximum*i/2,y=h-bottom-value/maximum*(h-top-bottom);markup+=`<line class="grid" x1="${left}" x2="${w-right}" y1="${y}" y2="${y}"/><text x="${left-7}" y="${y+4}" text-anchor="end">${bytes(value,0)}</text>`;}
  for(const p of points){const height=p.bytes/maximum*(h-top-bottom),x=left+(p.at-start)/(end-start)*(w-left-right)+(step-bar)/2;markup+=`<rect class="traffic-bar" x="${x}" y="${h-bottom-height}" width="${bar}" height="${Math.max(1,height)}" rx="2"><title>${date(p.at)} · ${bytes(p.bytes)} · ${number(p.requests)} 次请求</title></rect>`;}
  const label=t=>end-start>86400?date(t).slice(0,-3):clock(t);
  markup+=`<text x="${left}" y="${h-4}">${label(start)}</text><text x="${w-right}" y="${h-4}" text-anchor="end">${label(end)}</text>`;
  $(id).innerHTML=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="网站按小时发送流量，${points.length} 个小时有请求记录">${markup}</svg>`;
}

function renderSystem(){
  const m=state.metrics;if(!m?.memory)return;
  if(lastSystem===JSON.stringify(m))return;lastSystem=JSON.stringify(m);
  const days=Math.floor(m.uptime/86400),rem=Math.floor(m.uptime%86400/3600);
  const fields=[['公网地址',state.server],['系统',m.os],['主机名',m.hostname],['内核',m.kernel],['持续运行',`${days} 天 ${rem} 小时`],['CPU 核心',m.cores+' vCPU'],['负载 1 / 5 / 15 分钟',m.load.map(v=>number(v,2)).join(' / ')],['可用内存',bytes(m.memory.available)],['缓存',bytes(m.memory.cached)],['交换分区 Swap',`${bytes(m.memory.swapUsed)} / ${bytes(m.memory.swapTotal)}`],['磁盘读 / 写',`${bytes(m.readRate)}/s / ${bytes(m.writeRate)}/s`],['Inode 已用',percent((1-m.disk.inodeFree/m.disk.inodeTotal)*100)],['采集时间',date(m.at)]];
  for(const [name,v] of Object.entries(m.interfaces))fields.push([`网卡 ${name}`,`累计接收 ${bytes(v.rx)} / 发送 ${bytes(v.tx)}；错误 ${v.rxErrors+v.txErrors}，丢弃 ${v.rxDrops+v.txDrops}`]);
  $('host-details').innerHTML=fields.map(([k,v])=>`<dt>${escapeHTML(k)}</dt><dd>${escapeHTML(v)}</dd>`).join('');
  $('service-count').textContent=(m.services||[]).filter(r=>r.state==='active').length+'/'+(m.services||[]).length+' 活跃';
  $('services').innerHTML=(m.services||[]).map(r=>`<div class="service-row"><div><strong>${escapeHTML(r.name)}</strong><small>${escapeHTML(r.description)}</small></div>${badge(r.state==='active'?'运行中':r.state==='failed'?'失败':r.state,r.state==='active'?'good':r.state==='failed'?'bad':'neutral')}</div>`).join('');
  $('processes').innerHTML=(m.processes||[]).map(r=>`<tr><td>${escapeHTML(r.name)}</td><td>${r.pid}</td><td>${bytes(r.memory)}</td><td>${percent(r.cpu)}</td></tr>`).join('');
}

async function refresh(){
  if(API&&!accessToken){setLocked(true);return;}
  if(loading)return;loading=true;
  try{
    const response=await apiFetch('/api/status?hours='+hours,{cache:'no-store'});
    if(response.status===401){saveToken('');setLocked(true);message('login-error','登录已过期，请重新输入访问密码。');return;}
    if(!response.ok)throw new Error('HTTP '+response.status);
    state=await response.json();setLocked(false);message('connection-error','');
    if(state.mode==='server'){
      $('deployment-label').textContent='服务器观测台 2026.10.16.1 · Ubuntu 全天采集 · 密码保护';
      const methods=document.querySelectorAll('.method-list>div');
      methods[1].querySelector('p').textContent='由 Ubuntu 服务器发起 HTTPS 检测，验证证书并最多跟随 4 次跳转。国内用户体验请看上方三网节点。';
      methods[3].querySelector('strong').textContent='运行方式 · Ubuntu 全天采集';
      methods[3].querySelector('p').textContent='采集程序在服务器持续运行，关闭网页或电脑不会中断。数据保存在服务器，只有输入访问密码后才能查看。';
      document.querySelector('#system .section-head p').textContent='Ubuntu · 本机只读采集';
    }
    const target=$('china-target');
    if(!target.dataset.ready){target.innerHTML=state.targets.map(h=>`<option value="${escapeHTML(h)}">${escapeHTML(siteName(h))} · ${escapeHTML(h)}</option>`).join('');target.value=state.selectedTarget||state.china?.target||'manmiao-octevent.akihowaito.cn';target.dataset.ready='true';}
    for(const kind of ['metrics','sites','china']){const b=$('check-'+kind);b.disabled=!!state.running[kind];b.textContent=state.running[kind]?'检测中…':{metrics:'刷新资源',sites:'检查网站',china:'立即测国内'}[kind];}
    renderResources();renderHealth();renderTraffic();renderChina();renderChinaHistory();renderSites();renderSystem();
    const hist=state.history||[];
    $('history-caption').textContent=hist.length?`已显示 ${hist.length} 个采样点 · 实际覆盖 ${date(hist[0].at)} 至 ${date(hist[hist.length-1].at)} · 保存 7 天`:'每 30 秒采样 · 采集开始前没有历史数据';
    drawChart('usage-chart',['cpu','memory'],'%',100);drawChart('network-chart',['rxRate','txRate'],'B');
  }catch(e){message('connection-error',API?'无法连接 Ubuntu 采集服务，请检查网络后重试。已显示的数据不是最新状态。':'无法连接本机采集程序。请运行「启动监控.cmd」后重试。已显示的数据不会被当作最新结果。');$('connection').className='badge bad';$('connection').textContent='连接中断';$('overall').className='badge warn';$('overall').textContent='当前显示缓存数据';}
  finally{loading=false;}
}

async function trigger(kind){
  const button=$('check-'+kind);button.disabled=true;button.textContent='正在提交…';
  try{const r=await apiFetch('/api/refresh',{method:'POST',headers:{'Content-Type':'application/json','X-Monitor-Request':'1'},body:JSON.stringify({kind,...(kind==='china'?{target:$('china-target').value}:{})})});const d=await r.json();if(!r.ok)throw new Error(d.error);toast(kind==='china'?'已开始国内检测，通常需要 15–60 秒。':'检测已开始。');await refresh();}
  catch(e){toast(e.message);button.disabled=false;button.textContent={metrics:'刷新资源',sites:'检查网站',china:'立即测国内'}[kind];}
}

for(const kind of ['metrics','sites','china'])$('check-'+kind).addEventListener('click',()=>trigger(kind));
$('site-search').addEventListener('input',()=>state&&renderSites());$('only-issues').addEventListener('change',()=>state&&renderSites());
$('site-rows').addEventListener('click',event=>{const button=event.target.closest('[data-china-host]');if(!button)return;$('china-target').value=button.dataset.chinaHost;document.getElementById('china').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});trigger('china');});
document.querySelectorAll('[data-hours]').forEach(b=>b.addEventListener('click',()=>{hours=Number(b.dataset.hours);document.querySelectorAll('[data-hours]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});refresh();}));
document.querySelectorAll('nav a').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('nav a').forEach(x=>x.classList.toggle('active',x===a));}));
$('export').addEventListener('click',async()=>{
  const button=$('export');button.disabled=true;
  try{const r=await apiFetch('/api/export?hours='+hours);if(!r.ok)throw new Error();const data=await r.json();const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='服务器监控-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('报告已导出，包含检测时间、节点、资源与历史数据。');}catch(e){toast('报告导出失败，请检查采集程序是否运行。');}finally{button.disabled=false;}
});
$('login-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('login-submit');button.disabled=true;button.textContent='正在验证…';message('login-error','');
  try{const r=await apiFetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json','X-Monitor-Request':'1'},body:JSON.stringify({password:$('access-password').value})});const d=await r.json();if(!r.ok)throw new Error(d.error||'登录失败');saveToken(d.token);$('access-password').value='';setLocked(false);await refresh();}
  catch(e){message('login-error',e.message==='Failed to fetch'?'暂时无法连接服务器，请检查网络后重试。':e.message);}
  finally{button.disabled=false;button.textContent='进入监控台';}
});
$('logout').addEventListener('click',async()=>{try{await apiFetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json','X-Monitor-Request':'1'},body:'{}'});}finally{saveToken('');location.reload();}});
setLocked(!!API&&!accessToken);refresh();setInterval(refresh,10000);
let resizeFrame;
window.addEventListener('resize',()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{if(!state)return;renderSites();drawChart('usage-chart',['cpu','memory'],'%',100);drawChart('network-chart',['rxRate','txRate'],'B');});});
