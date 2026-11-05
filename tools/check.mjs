// EatTogether 驗收腳本：node tools/check.mjs
// 檢查 pages.json、首頁清單、實際檔案是否一致；每頁的必要結構；所有相對連結與圖片是否存在。
// 如果環境裝了 Playwright，另外用 375px 手機寬度檢查每頁沒有橫向捲動、沒有 console 錯誤。
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const fail = (msg) => problems.push(msg);
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

// 1. pages.json
let manifest;
try { manifest = JSON.parse(read("pages.json")); } catch (e) { fail("pages.json 不是合法 JSON：" + e.message); manifest = { pages: [] }; }
const pages = manifest.pages || [];
const seen = new Set();
for (const [i, p] of pages.entries()) {
  for (const k of ["path", "title", "tag", "summary", "updated"]) if (!p[k]) fail(`pages.json 第 ${i + 1} 筆缺少「${k}」`);
  if (seen.has(p.path)) fail(`pages.json 重複的 path：${p.path}`);
  seen.add(p.path);
  if (p.path && !exists(p.path)) fail(`pages.json 列了不存在的檔案：${p.path}`);
  if (p.path && p.path.startsWith("pages/") && !/^pages\/[a-z0-9]+(-[a-z0-9]+)*\.html$/.test(p.path)) fail(`檔名要用英文小寫 kebab-case：${p.path}`);
  if (p.updated && !/^\d{4}-\d{2}-\d{2}$/.test(p.updated)) fail(`updated 要寫成 YYYY-MM-DD：${p.path}`);
}
for (const f of fs.readdirSync(path.join(ROOT, "pages"))) {
  if (f.endsWith(".html") && !seen.has("pages/" + f)) fail(`pages/${f} 沒有登記在 pages.json`);
}

// 2. 首頁清單要和 pages.json 一致（同順序、同標題與摘要）
const index = read("index.html");
const block = (index.match(/<!-- PAGE-LIST:START[\s\S]*?-->([\s\S]*?)<!-- PAGE-LIST:END -->/) || [])[1];
if (!block) fail("index.html 找不到 PAGE-LIST:START / PAGE-LIST:END 區塊");
else {
  const cards = [...block.matchAll(/<a class="page-card" href="([^"]+)"><span class="tag">([^<]*)<\/span><h3>([^<]*)<\/h3><p>([^<]*)<\/p><\/a>/g)]
    .map((m) => ({ path: m[1], tag: m[2], title: m[3], summary: m[4] }));
  if (cards.length !== pages.length) fail(`首頁有 ${cards.length} 張卡片，pages.json 有 ${pages.length} 筆`);
  pages.forEach((p, i) => {
    const c = cards[i];
    if (!c) return;
    for (const k of ["path", "tag", "title", "summary"]) if (c[k] !== p[k]) fail(`首頁第 ${i + 1} 張卡片的 ${k} 和 pages.json 不一樣（${c[k]} ≠ ${p[k]}）`);
  });
}

// 3. 每一頁的必要結構
const htmlFiles = ["index.html", "app/index.html", ...pages.map((p) => p.path).filter((p) => p.startsWith("pages/"))];
for (const f of [...new Set(htmlFiles)].filter(exists)) {
  const s = read(f);
  if (!/<title>[^<]+<\/title>/.test(s)) fail(`${f} 缺少 <title>`);
  if (!/<meta name="description" content="[^"]+">/.test(s)) fail(`${f} 缺少 meta description`);
  if (!/<html lang="zh-Hant">/.test(s)) fail(`${f} 的 <html> 要加 lang="zh-Hant"`);
  if (f.startsWith("pages/")) {
    if (!s.includes("data-site-header")) fail(`${f} 缺少共用頁首（data-site-header）`);
    if (!s.includes("data-site-footer")) fail(`${f} 缺少共用頁尾（data-site-footer）`);
    if (!s.includes('<main class="page wrap">')) fail(`${f} 缺少 <main class="page wrap">`);
    if (!s.includes("../assets/css/site.css")) fail(`${f} 沒有載入 ../assets/css/site.css`);
    if (s.includes("TODO")) fail(`${f} 還留著樣板的 TODO`);
    const p = pages.find((x) => x.path === f);
    const desc = (s.match(/<meta name="description" content="([^"]+)">/) || [])[1];
    if (p && desc && desc !== p.summary) fail(`${f} 的 meta description 要和 pages.json 的 summary 一樣`);
  }
  // 相對連結與資源
  for (const m of s.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const url = m[1];
    if (/^(https?:|mailto:|#|data:|javascript:)/.test(url)) {
      if (/^https?:/.test(url) && !/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|github\.com)/.test(url)) fail(`${f} 用了不允許的外部資源：${url}`);
      continue;
    }
    if (url.startsWith("/")) { fail(`${f} 用了絕對路徑（GitHub Pages 子路徑下會壞）：${url}`); continue; }
    const target = path.normalize(path.join(path.dirname(f), url.split("#")[0].split("?")[0]));
    if (!exists(target)) fail(`${f} 的連結指到不存在的檔案：${url}`);
  }
  for (const m of s.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt="/.test(m[0])) fail(`${f} 有 <img> 沒有 alt：${m[0].slice(0, 60)}`);
  }
}

// 4. 選用：用 Playwright 檢查手機寬度
async function browserCheck() {
  let chromium;
  try { ({ chromium } = createRequire(import.meta.url)("playwright")); } catch (e) { console.log("（沒有 Playwright，略過手機版面檢查）"); return; }
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  for (const width of [375, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 740 } });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const f of [...new Set(htmlFiles)]) {
      errors.length = 0;
      await page.goto(base + f);
      await page.waitForTimeout(300);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 0) fail(`${f} 在 ${width}px 寬有橫向捲動（多出 ${over}px）`);
      if (errors.length) fail(`${f} 有頁面錯誤：${errors.join("；")}`);
    }
    await page.close();
  }
  await browser.close();
  server.close();
}

await browserCheck();
if (problems.length) {
  console.log(`✗ 發現 ${problems.length} 個問題：`);
  for (const p of problems) console.log("  - " + p);
  process.exit(1);
}
console.log(`✓ 全部通過：${pages.length} 個頁面、${htmlFiles.length} 個 HTML 檔`);
