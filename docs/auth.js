// Supabase Auth 会话仅放在内存；刷新网页后需重新登录。不保存密码或 Token。
let marketSession=null;
function marketConfigured(){const c=window.WEALTH_CONFIG;return !!(c?.supabaseUrl?.startsWith('https://')&&!c.supabaseUrl.includes('YOUR_')&&c.supabasePublicKey&&!c.supabasePublicKey.includes('YOUR_'))}
function marketEndpoint(){return window.WEALTH_CONFIG.supabaseUrl.replace(/\/$/,'')+'/functions/v1/market-quotes'}
function marketLoginPanel(){return `<div class="panel" style="margin-bottom:20px"><h2>行情账户登录</h2><p class="sub">${marketConfigured()?'已配置 Supabase。登录只用于保护行情接口；财富数据暂不云端同步。':'请先按部署指南填写 config.js 中的项目 URL 与公开 Key。'}</p>${marketSession?'<p>行情已登录</p><button onclick="marketLogout()">退出行情账户</button>':`<form onsubmit="event.preventDefault();marketLogin(this)"><div class="controls" style="grid-template-columns:1fr 1fr"><label>邮箱<input type="email" name="email" autocomplete="username" required></label><label>密码<input type="password" name="password" autocomplete="current-password" required></label></div><button class="primary" type="submit">登录并获取行情</button></form>`}<p class="sub">持仓代码与行情请求会发送到你配置的 Supabase 项目及 Twelve Data；不发送持仓数量、余额和历史快照。</p></div>`}
async function authRequest(path,body){const c=window.WEALTH_CONFIG;const r=await fetch(c.supabaseUrl.replace(/\/$/,'')+'/auth/v1/'+path,{method:'POST',headers:{apikey:c.supabasePublicKey,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const d=await r.json();if(!r.ok)throw Error(d.error_description||d.msg||'登录失败');return {...d,expiresAt:Date.now()+(d.expires_in||3600)*1000}}
async function marketLogin(form){if(!marketConfigured()){toast('请先填写部署配置');return}const button=form.querySelector('button');button.disabled=true;try{marketSession=await authRequest('token?grant_type=password',{email:form.email.value.trim(),password:form.password.value});form.password.value='';render();await refreshQuotes()}catch(e){toast(e.message)}finally{button.disabled=false}}
async function marketLogout(){if(marketSession){try{await fetch(window.WEALTH_CONFIG.supabaseUrl+'/auth/v1/logout',{method:'POST',headers:{apikey:window.WEALTH_CONFIG.supabasePublicKey,Authorization:'Bearer '+marketSession.access_token}})}catch{}}marketSession=null;render();toast('已退出行情账户')}
async function requestMarketQuotes(url){if(!marketConfigured()){const r=await fetch(url,{signal:AbortSignal.timeout(12000),cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return r.json()}
 if(!marketSession)throw Error('请在数据与设置中登录行情账户');
 if(Date.now()>marketSession.expiresAt-60000){try{marketSession=await authRequest('token?grant_type=refresh_token',{refresh_token:marketSession.refresh_token})}catch{marketSession=null;throw Error('登录过期，请重新登录')}}
 const symbols=[...new Set(state.assets.filter(a=>a.type==='stock'&&a.currency==='USD').map(a=>a.symbol))];
 if(symbols.length>7)throw Error('此版本每次最多查询7个美股代码');
 const r=await fetch(url,{method:'POST',headers:{apikey:window.WEALTH_CONFIG.supabasePublicKey,Authorization:'Bearer '+marketSession.access_token,'Content-Type':'application/json'},body:JSON.stringify({symbols}),signal:AbortSignal.timeout(100000)});
 const d=await r.json();if(!r.ok)throw Error(d.error||'行情请求失败');return d;
}
