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
| [抵銷怎麼算](pages/algorithm.html) | 循環互欠、債權轉移的圖解，以及可以自己試的小例子 |
| [聰明分帳小工具](pages/split.html) | 算每人應付、誰給誰多少、要掏哪些鈔票 |
| [開發日誌](pages/devlog.html) | 每一版改了什麼 |

## 資料存在哪裡

- 在 **GitHub Pages** 打開：本機模式，資料存在這支手機的瀏覽器（可以在「成員」頁匯出／匯入備份）。
- 在 **claude.ai** 以 Artifact 打開：使用平台的共享資料庫，朋友的手機會即時同步。

## 給 AI 的規則

專案規則全部寫在 [CLAUDE.md](CLAUDE.md)：設計規範、檔案命名、每頁結構、新增頁面的 SOP 和驗收標準。其他 AI 工具請看 [AGENTS.md](AGENTS.md)。

## 本機預覽與檢查

```bash
python3 -m http.server 8000      # 然後打開 http://localhost:8000
node --test                      # 計算邏輯測試
node tools/check.mjs             # 頁面清單、結構、連結檢查（有 Playwright 時也檢查手機版面）
```

純靜態網站，不需要安裝任何套件。
