// 枚举抖音用户全部作品 ID（需登录态以突破匿名限制）
// 用法: node enum_user.js <sec_uid> --out <输出目录> [--profile <登录profile目录>]
// 产出: <输出目录>/_manifest.json（仅 aweme_id/标题/类型，无统计数据）
//       <输出目录>/user.json（昵称/抖音号）
// 未登录或数量不足时自动弹出可见浏览器等待用户扫码登录（最长 10 分钟）。
// 自动定位 playwright-core（依次尝试 NODE_PATH、~/.workbuddy 托管工作区、~ 与本技能目录下的 node_modules）
// 若全部失败：在上述任一 node_modules 所在目录执行 npm install playwright-core
const path = require('path');
const os = require('os');
const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir();
const CANDIDATE_MODULES = [
  process.env.NODE_PATH || '',
  path.join(HOME, '.workbuddy', 'binaries', 'node', 'workspace', 'node_modules'),
  path.join(HOME, 'node_modules'),
  path.join(__dirname, '..', 'node_modules'),
].filter(Boolean);
for (const p of CANDIDATE_MODULES) { try { module.paths.push(p); } catch (e) {} }
const { chromium } = require('playwright-core');
const fs = require('fs');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function parseArgs(argv) {
  const secUid = argv[2];
  let out = null, profile = path.join(__dirname, '..', '_login_profile');
  for (let i = 3; i < argv.length; i++) {
    if (argv[i] === '--out') out = argv[++i];
    else if (argv[i] === '--profile') profile = argv[++i];
  }
  if (!secUid || !out) { console.error('用法: node enum_user.js <sec_uid> --out <目录> [--profile <目录>]'); process.exit(1); }
  return { secUid, out, profile };
}

function findEdge() {
  const cands = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const p of cands) if (fs.existsSync(p)) return p;
  throw new Error('未找到 Edge/Chrome，请安装或修改本脚本中的浏览器路径');
}

async function isLoggedIn(ctx) {
  const cookies = await ctx.cookies('https://www.douyin.com');
  return cookies.some(c => c.name === 'sessionid' && c.value.length > 5);
}

async function waitForLogin(ctx, page, maxMs = 10 * 60 * 1000) {
  console.log('等待登录：请在弹出的浏览器窗口中扫码/验证码登录抖音（最长 10 分钟）...');
  await page.goto('https://www.douyin.com/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (await isLoggedIn(ctx)) { console.log('登录成功'); return true; }
    await page.waitForTimeout(5000);
  }
  return false;
}

async function collect(ctx, secUid, headless) {
  const browser = await chromium.launch({
    executablePath: findEdge(), headless,
    args: headless ? ['--disable-gpu'] : ['--disable-gpu', '--window-position=100,100'],
  });
  const page = await ctx.newPage();
  const pages = [];
  page.on('response', async (resp) => {
    try {
      if (resp.url().includes('aweme/post')) {
        const ct = resp.headers()['content-type'] || '';
        if (ct.includes('json')) {
          const body = await resp.text();
          if (body.includes('aweme_list')) pages.push(JSON.parse(body));
        }
      }
    } catch (e) {}
  });

  const items = new Map();
  let nickname = null, douyinId = null, claimedCount = null;

  try {
    await page.goto(`https://www.douyin.com/user/${secUid}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6000);
    // 提取昵称/抖音号/作品数（来自页面文本）
    const info = await page.evaluate(() => {
      const t = document.body.innerText || '';
      const nick = (t.match(/^([\s\S]{0,30}?)的抖音/) || [])[1] || null;
      const dyid = (t.match(/抖音号[\s:]*([A-Za-z0-9_]+)/) || [])[1] || null;
      const cnt = (t.match(/作品\s*([\d,.]+[万+kK]?)\s*/) || [])[1] || null;
      return { nick, dyid, cnt };
    });
    nickname = info.nick; douyinId = info.dyid;
    claimedCount = info.cnt;
    console.log('用户信息:', JSON.stringify({ nickname, douyinId, claimedCount }));

    let idle = 0, round = 0;
    while (round < 300 && idle < 15) {
      round++;
      await page.mouse.move(700, 450).catch(() => {});
      await page.mouse.wheel(0, 5000);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
      await page.waitForTimeout(1500 + Math.floor(Math.random() * 1000));
      for (const p of pages) for (const a of (p.aweme_list || [])) {
        if (!items.has(a.aweme_id)) items.set(a.aweme_id, {
          aweme_id: a.aweme_id, desc: (a.desc || '').trim(),
          aweme_type: a.aweme_type, has_images: !!(a.images || []).length,
        });
      }
      const n = pages.length;
      if (n && pages[n - 1].has_more === false) { console.log('has_more=false，枚举完成'); break; }
      if (n === (collect._lp || 0)) idle++; else idle = 0;
      collect._lp = n;
      if (round % 10 === 0) console.log(`round ${round}, pages: ${n}, items: ${items.size}`);
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return { items: Array.from(items.values()), nickname, douyinId, claimedCount };
}

(async () => {
  const { secUid, out, profile } = parseArgs(process.argv);
  fs.mkdirSync(profile, { recursive: true });
  fs.mkdirSync(out, { recursive: true });

  const executablePath = findEdge();
  // 阶段 A：无头尝试
  let ctx = await chromium.launchPersistentContext(profile, {
    executablePath, headless: true, viewport: { width: 1400, height: 900 },
    locale: 'zh-CN', timezoneId: 'Asia/Shanghai', args: ['--disable-gpu'],
  });
  let loggedIn = await isLoggedIn(ctx);
  console.log('已有登录态:', loggedIn);
  let r = await collect(ctx, secUid, true);
  await ctx.close().catch(() => {});

  // 阶段 B：无登录态且数量可疑 → 弹窗登录后重试
  const claimed = claimedCount ? parseInt(String(claimedCount).replace(/[万+kK,]/g, m => /[万]/.test(m) ? String(parseFloat(claimedCount) * 10000) : m)) : null;
  const suspicious = !loggedIn && r.items.length < 30 &&
    (claimed == null || r.items.length < claimed * 0.9);
  if (suspicious) {
    console.log(`无登录态仅获 ${r.items.length} 条（主页显示 ${claimedCount || '?'}），需要登录`);
    ctx = await chromium.launchPersistentContext(profile, {
      executablePath, headless: false, viewport: { width: 1400, height: 900 },
      locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
    });
    const ok = await waitForLogin(ctx, ctx.pages()[0] || await ctx.newPage());
    if (!ok) { console.error('ERROR: 等待登录超时'); await ctx.close().catch(() => {}); process.exit(2); }
    r = await collect(ctx, secUid, false);
    await ctx.close().catch(() => {});
  }

  fs.writeFileSync(path.join(out, 'user.json'), JSON.stringify(
    { nickname: r.nickname, douyin_id: r.douyinId, sec_uid: secUid }, null, 1));
  fs.writeFileSync(path.join(out, '_manifest.json'), JSON.stringify(
    { total: r.items.length, items: r.items }, null, 1));
  console.log(`DONE items=${r.items.length}`);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
