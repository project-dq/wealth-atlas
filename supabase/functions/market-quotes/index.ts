// 可直接粘贴到 Supabase Edge Function 编辑器。无外部依赖。
const cache = new Map<string, { at: number; data: unknown }>();
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);
  const cors: Record<string,string> = {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : 'https://invalid.example',
    'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  };
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });
  if (!allowed.includes(origin)) return reply({error:'来源未获允许，请检查 ALLOWED_ORIGINS'},403);
  if (req.method === 'OPTIONS') return new Response(null, {status:204,headers:cors});
  if (req.method !== 'POST') return reply({error:'仅支持 POST'},405);
  const key = Deno.env.get('TWELVE_DATA_API_KEY');
  const owner = Deno.env.get('OWNER_EMAIL')?.toLowerCase();
  const sb = Deno.env.get('SUPABASE_URL');
  const publicKey = Deno.env.get('AUTH_PUBLIC_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
  if (!key || !owner || !sb || !publicKey) return reply({error:'后端配置不完整'},503);
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return reply({error:'请先登录'},401);
  try {
    const userResponse = await fetch(sb+'/auth/v1/user', {headers:{apikey:publicKey,Authorization:auth},signal:AbortSignal.timeout(10000)});
    if (!userResponse.ok) return reply({error:'登录已失效，请重新登录'},401);
    const user = await userResponse.json();
    if (!user.email_confirmed_at || user.email?.toLowerCase() !== owner) return reply({error:'该账户无权调用行情'},403);
    const body = await req.json();
    if (!Array.isArray(body.symbols)) return reply({error:'缺少股票代码列表'},400);
    const symbols = [...new Set(body.symbols)] as string[];
    if (symbols.length > 7 || !symbols.every(s=>typeof s==='string' && /^[A-Z0-9.\-]{1,20}$/.test(s))) return reply({error:'最多支持7个美股代码，请检查代码格式'},400);
    const cacheKey = symbols.slice().sort().join(',');
    const cached = cache.get(cacheKey);
    if (cached && Date.now()-cached.at < 15*60*1000) return reply(cached.data);
    // 每个标的各 1 次 quote，汇率 1 次；串行请求便于控制并发。
    const quotes: Record<string,number> = {}, quoteTimes: Record<string,string> = {};
    async function quote(symbol: string, currency: string) {
      const url = new URL('https://api.twelvedata.com/quote');
      url.searchParams.set('symbol',symbol);url.searchParams.set('apikey',key!);
      const res = await fetch(url,{signal:AbortSignal.timeout(10000)});
      if (!res.ok) throw new Error('行情供应商 HTTP '+res.status);
      const q = await res.json();
      if (q.status === 'error') throw new Error(q.code===429?'行情额度已用完，请稍后重试':'供应商不支持该标的或套餐权限不足');
      const price = Number(q.close), stamp=Number(q.timestamp);
      if (!Number.isFinite(price)||price<=0||!Number.isFinite(stamp)||stamp<=0||q.currency!==currency) throw new Error('行情币种、价格或时间无效：'+symbol);
      return {price,time:new Date(stamp*1000).toISOString()};
    }
    for (const symbol of symbols) {const q=await quote(symbol,'USD');quotes[symbol]=q.price;quoteTimes[symbol]=q.time;}
    const fx=await quote('USD/SEK','SEK');
    const times=[fx.time,...Object.values(quoteTimes)];
    const data={quotes,usdsek:fx.price,asOf:times.sort()[0],quoteTimes,fxAsOf:fx.time,fetchedAt:new Date().toISOString(),source:'Twelve Data'};
    cache.set(cacheKey,{at:Date.now(),data});
    return reply(data);
  } catch (error) {
    const message=error instanceof Error?error.message:'';
    // 不返回供应商响应体、请求 URL 或密钥。
    const safe=message.startsWith('行情')||message.startsWith('供应商')?message:'行情获取失败，请稍后重试';
    return reply({error:safe},502);
  }
});
