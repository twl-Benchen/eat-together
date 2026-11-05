# CLAUDE.md — EatTogether 飯友帳本 專案手冊

這份文件寫給接手這個專案的 AI（以及人類）。開始任何修改之前，先讀完這份文件。這裡的規則優先於你自己的習慣與預設做法。

---

## 1. 專案目的

- **解決的問題**：朋友一起吃飯時鈔票常常找不開，大家互相先幫忙付，久了就記不清誰欠誰。
- **產出**：一個以手機為主的靜態網站，包含：
  1. **記帳 App**（`app/`）：拖曳頭像記錄「誰幫誰代墊」，一鍵抵銷債務，用最少轉帳結清。
  2. **說明與工具頁**（`pages/`）：使用教學、演算法說明、開發日誌、分帳小工具…，之後會照本文件的規則繼續增加。
- **讀者**：大學生朋友群，主要在手機上看。說話要白話、具體，像朋友在解釋，不要像說明書。

## 2. 技術限制（不可違反）

| 項目 | 規則 |
|---|---|
| 架構 | 純靜態 HTML / CSS / JavaScript。**不用框架、不用打包工具、不需要 build**，直接用瀏覽器打開就要能動。 |
| 部署 | GitHub Pages，從 `main` 分支根目錄發佈。網址會在子路徑（`/eat-together/`）下，所以**所有連結都用相對路徑**（`../assets/...`），不可以用 `/` 開頭的絕對路徑。 |
| 外部資源 | 只允許 Google Fonts。其他 JS/CSS 一律放在 repo 裡。 |
| 資料 | App 在 claude.ai 上用平台共享資料庫，其他地方用 `app/store.js` 的本機模式（localStorage）。不要加後端或第三方服務。 |
| 相容性 | 手機 Safari / Chrome 最新兩版。寬度 320px 到桌機都要正常，**任何寬度都不能出現橫向捲動**。 |

## 3. 設計規範

所有樣式來自 `assets/css/site.css`。**不要在頁面裡另外發明顏色或字體。**

### 3.1 色票（莫蘭迪藍灰＋杏橘）

| Token | 淺色 | 用途 |
|---|---|---|
| `--bg` | `#EEF2F6` | 頁面底色 |
| `--surface` / `--surface-2` | `#FFFFFF` / `#F6F8FA` | 卡片、輸入框底 |
| `--ink` | `#2E3A4F` | 主要文字 |
| `--muted` | `#5F6D82` | 次要文字、說明 |
| `--line` | `#DDE5ED` | 分隔線、邊框 |
| `--accent` | `#435369` | 主要按鈕（深石板藍） |
| `--blue` / `--get` | `#536D82` / `#4E6880` | 連結、「要收」 |
| `--owe` / `--owe-line` | `#A65F17` / `#E08E2E` | 「要付」的文字 / 線條 |
| `--apricot` | `#F5B461` | 唯一的暖色點綴：標題底線、焦點框、標籤 |
| `--cream` | `#FFF4E3` | 重點提示底色 |

- 杏橘只用來**點綴重點**，大約占畫面一到兩成。
- 「要付」一律杏橘、「要收」一律藍灰。**不要用紅綠色**表示欠款。
- 要新增顏色時：先在 `site.css` 的 `:root` 加 token，並在**兩個深色模式區塊**加上對應的值，之後才能使用。頁面裡不准直接寫色碼（SVG 圖示內的白字除外）。

### 3.2 字體

| 角色 | 變數 | 用在 |
|---|---|---|
| 標題 | `--f-display`（霞鶩文楷 TC） | `h1`～`h3` |
| 內文 | `--f-body`（Noto Sans TC） | 段落、按鈕、表單 |
| 數字 | `--f-num`（Nunito） | 金額、日期，加 class `num` |

### 3.3 其他

- 圓角 `--r`（16px），邊距 `--space`（16px），內容最寬 720px（`.wrap`）。
- 卡片用 `.card`，提示框用 `.note`，按鈕用 `.btn`／`.btn.secondary`，標籤用 `.tag`。
- 每頁都必須支援深色模式：只透過 token 上色，深色模式就會自動正確。
- 不用 emoji 當圖示；需要圖示時畫簡單的 inline SVG，顏色用 `currentColor` 或 token。
- 動畫要尊重 `prefers-reduced-motion`。

## 4. 檔案結構與命名

```
eat-together/
├── CLAUDE.md            ← 本文件
├── AGENTS.md            ← 指向本文件（給其他 AI 工具）
├── README.md            ← 專案簡介、網址、本機預覽
├── index.html           ← 首頁／索引，列出所有頁面
├── pages.json           ← 頁面清單（機器可讀）
├── app/                 ← 記帳 App（index.html、ledger.js、store.js）
├── pages/               ← 內容頁，一頁一個 .html
├── templates/page.html  ← 新頁面樣板
├── assets/css/site.css  ← 全站樣式與 token
├── assets/js/site.js    ← 共用小腳本（導覽高亮、年份）
├── assets/img/          ← 圖片與截圖
├── test/                ← 計算邏輯測試（node --test）
└── tools/check.mjs      ← 驗收腳本
```

- **頁面檔名**：英文小寫 kebab-case，例如 `pages/group-trip.html`。不用中文、空白或大寫。
- **圖片**：放 `assets/img/`，命名 `<頁面檔名>-<序號>.png`，例如 `guide-3.png`。截圖寬 390px，用 2 倍解析度，檔案 300KB 以內。`<img>` 一定要有具體的 `alt` 和 `width`。
- **文案**：繁體中文、台灣用語（例：「代墊」「轉帳」「找錢」）。金額寫成 `$120`，新台幣不加小數。

## 5. 每一頁的結構（`pages/` 底下）

每一頁都從 `templates/page.html` 複製，並且**必須**有：

1. `<title>頁面名稱 · EatTogether</title>` 和一句話的 `<meta name="description">`。
2. 共用頁首 `<header class="site-header" data-site-header>`：品牌連回首頁，加上導覽（首頁／記帳／教學）。
3. `<main class="page wrap">`，開頭是 `.page-head`：`.eyebrow`（分類）→ `h1` → `.lead`（一兩句導言）。
4. 內文用 `h2` 分段，每段只講一件事；需要時加 `h3`。
5. 共用頁尾 `<footer class="site-footer" data-site-footer>`，最後載入 `../assets/js/site.js`。
6. 頁面自己的小程式直接寫在該頁底部的 `<script>`。要用到帳本計算時，載入 `../app/ledger.js`，不要複製一份。

## 6. 新增頁面的標準流程（AI 必須照順序做）

1. **確認主題**：這頁的分類要從現有的 `App`、`教學`、`原理`、`工具`、`紀錄` 選一個。真的不適合才新增分類，並在本文件記下來。
2. **建立檔案**：`cp templates/page.html pages/<kebab-case>.html`，刪掉所有 `TODO` 註解，填好 title、description、eyebrow、h1、lead 和內容。
3. **登記到 `pages.json`**：在 `pages` 陣列加一筆 `{ path, title, tag, summary, updated }`。`summary` 和 meta description 用同一句話，`updated` 是今天日期（YYYY-MM-DD）。
4. **更新首頁 `index.html`**：在 `<!-- PAGE-LIST:START -->` 和 `<!-- PAGE-LIST:END -->` 之間，照 `pages.json` 的順序加一張 `.page-card`（標籤、標題、摘要三樣要一致）。
5. **寫開發日誌**：在 `pages/devlog.html` 最上面加一個 `<article class="card">`，寫日期、版本和改了什麼。
6. **驗收**：跑 `node tools/check.mjs` 和 `node --test`，全部通過才算完成。
7. **回報**：告訴使用者新增了哪些檔案、首頁多了哪張卡片。

修改既有頁面時不用新增 `pages.json` 項目，但要更新 `updated` 日期，有實質改變時也要寫開發日誌。

## 7. 記帳 App 的規則（`app/`）

- **資料格式不可改語意**（共享資料庫裡已經有使用者的真實資料）：
  - `debt {from, to, amount}`：from 欠 to。畫面上說成「to 幫 from 代墊」。
  - `repay {from, to, amount}`：from 還錢給 to。
  - `offset {items[]}`：抵銷時的調整，每一項是「from 欠 to 再加 amount」。
  - `baseline {items[], replaces[]}`：抵銷滿 3 天後的結算，`replaces` 裡的紀錄不再計算。
  - 新欄位只能**新增**，不能改名或改意思。
- **互動語意**：
  - 拖曳＝從代墊的人拖到被代墊的人。
  - 關係圖的箭頭＝誰要給誰錢（欠錢的人 → 收錢的人）。
  - 杏橘＝我要付，藍灰＝我要收。
- **計算邏輯**只放在 `app/ledger.js`，而且是不碰畫面的純函式。改計算前先在 `test/ledger.test.mjs` 加測試，再改程式。
- **儲存**一律透過 `state.db`（共享資料庫或 `EatStore.local.db`）。不要在 App 裡直接讀寫 localStorage，「我是誰」這種個人設定除外。
- 從資料庫讀出來的名字、備註都是別人輸入的，**只能用 `textContent` 放進畫面**，不可以用 `innerHTML`。

## 8. 驗收標準（完成任何工作前都要檢查）

- [ ] `node tools/check.mjs` 通過：`pages.json`、首頁清單、實際檔案三者一致；每頁都有共用頁首頁尾、title、description；所有相對連結和圖片都存在。
- [ ] `node --test` 全部通過。
- [ ] 手機寬 375px（和 320px）沒有橫向捲動，文字沒有被截斷或重疊。
- [ ] 深色模式下文字看得清楚（文字和背景對比至少 4.5:1）。
- [ ] 瀏覽器 console 沒有錯誤。
- [ ] 圖片都有 `alt`；按鈕、輸入框可以用鍵盤操作。

## 9. 不要做的事

- 不要放真實姓名、照片或帳務資料：範例一律用「小明、小華、阿傑」。
- 不要加框架、npm 套件、node_modules，也不要加需要 build 的流程。
- 不要用 `/` 開頭的絕對路徑，也不要連到 Google Fonts 以外的外部 CDN。
- 不要改掉別頁的風格去配合新頁面。需要新元件時加在 `site.css`，讓全站共用。
- 不要刪除或改寫開發日誌裡的舊紀錄，只能往上新增。
- 不要只改首頁或只改 `pages.json`，兩邊一定要一起改。
