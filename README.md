# EatTogether 飯友帳本

朋友一起吃飯、鈔票找不開時，用來記「誰幫誰代墊」的手機網頁。把硬幣從代墊的人拖到被代墊的人就記好了；欠來欠去時按「抵銷債務」，用最少的轉帳結清。

- **網站**：https://twl-benchen.github.io/eat-together/
- **記帳 App**：https://twl-benchen.github.io/eat-together/app/

## 內容

| 頁面 | 說明 |
|---|---|
| [首頁](index.html) | 所有頁面的索引 |
| [記帳 App](app/index.html) | 拖曳記帳、關係圖、一鍵抵銷、紀錄、成員與頭貼 |
| [使用教學](pages/guide.html) | 一步一步的操作說明（附截圖） |
| [在 claude.ai 使用](pages/claude-ai.html) | 放到 claude.ai 變成可以多人同步的版本 |
| [抵銷怎麼算](pages/algorithm.html) | 循環互欠、債權轉移的圖解，以及可以自己試的小例子 |
| [聰明分帳小工具](pages/split.html) | 算每人應付、誰給誰多少、要掏哪些鈔票 |
| [開發日誌](pages/devlog.html) | 每一版改了什麼 |

## 資料存在哪裡

- 在 **GitHub Pages** 打開：本機模式，資料存在這支手機的瀏覽器（可以在「成員」頁匯出／匯入備份）。
- 在 **claude.ai** 以 Artifact 打開：使用平台的共享資料庫，朋友的手機會即時同步。

## 在 claude.ai 使用（多人同步）

GitHub Pages 版是本機模式，資料不會在朋友之間同步。想讓大家看到同一份帳，可以把 App 放到 claude.ai 變成 Artifact：

1. 準備三個檔案：`app/index.html`、`app/ledger.js`、`app/store.js`（或直接給 Claude 這個 repo 的網址）。
2. 對 Claude 說：

   > 請把附上的 EatTogether 記帳 App 發佈成一個 claude.ai Artifact：主頁面用 app/index.html，ledger.js 和 store.js 當作同一個 Artifact 的附屬檔案（路徑保持 ledger.js、store.js）；capabilities 開啟 db、user、assets（預設設定）；不要修改計算邏輯和資料格式；發佈後讀一次 members 和 entries 確認資料庫可用，並給我連結。

3. 用 Artifact 的分享功能，以 email 邀請朋友並設為「編輯者」。**不要開公開連結**，否則受邀的朋友不能記帳。

**隱私**：每個 Artifact 都有自己獨立的資料庫，你發佈的是一份全新的空帳本，看不到作者或其他人的帳。這個 repo 只有程式碼，沒有任何人的名字或帳務資料。自己的 Artifact 連結只分享給一起吃飯的朋友，不要貼到公開的地方。

詳細步驟見網站上的 [在 claude.ai 使用](pages/claude-ai.html)。

## 給 AI 的規則

專案規則全部寫在 [CLAUDE.md](CLAUDE.md)：設計規範、檔案命名、每頁結構、新增頁面的 SOP 和驗收標準。其他 AI 工具請看 [AGENTS.md](AGENTS.md)。

## 本機預覽與檢查

```bash
python3 -m http.server 8000      # 然後打開 http://localhost:8000
node --test                      # 計算邏輯測試
node tools/check.mjs             # 頁面清單、結構、連結檢查（有 Playwright 時也檢查手機版面）
```

純靜態網站，不需要安裝任何套件。
