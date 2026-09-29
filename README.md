# 📋 訂閱管家（sub-tracker）

忘記自己訂了什麼、錢花去哪的終結者。手機優先的訂閱管理網頁：記錄每筆訂閱、下次扣款倒數、月曆檢視、每月花費統計、到期前提醒。

## 功能（MVP 第一版）

- **首頁**：本月已扣金額、下月預估、7 天內扣款清單、每月花費分類長條圖、即將扣款紅色橫幅
- **訂閱清單**：卡片式，下次扣款倒數、累計已付金額；可編輯；「取消訂閱」只改狀態（保留歷史供累計計算），「刪除」才是永久移除
- **新增/編輯**：常見訂閱一鍵帶入（Netflix 390、Spotify 149、YouTube Premium 199、iCloud+ 90、Google One 100GB 65、Disney+ 270、KKBOX 149，皆可再改）
- **月曆**：當月扣款日紅點標記，可切換月份；試用到期日也標示
- **取消指南**：7 個常見訂閱的取消路徑文字說明
- **到期提醒**：`GET /api/due` 回傳 7 天內扣款＋3 天內試用到期清單；有設 Resend 金鑰則自動發 email

## 技術

- 純 vanilla JS，無 build step；手機優先 RWD
- Cloudflare Pages + Functions + D1（架構同 shift-fill）
- 核心日期邏輯 `public/logic.js` 為純函數，前端與後端（`functions/logic.js`，同一份複製）共用
- USD 統計以固定匯率 1:32 換算台幣，UI 標示「估算」
- 月底規則：1/31 月繳 → 2 月取 28 日（閏年 29 日），之後月份回到 31 日（錨點保留）

## 資料表

`subs`：id, name, amount, currency('TWD'/'USD'), cycle(weekly/monthly/quarterly/halfyear/yearly/custom), cycle_days, first_billing(YYYY-MM-DD), pay_method, category, note, status(trial/active/paused/cancelled), trial_end, created_at, updated_at

## Cloudflare 部署步驟

1. 在 Cloudflare Dashboard 建立 Pages 專案，連結此 repo（或直接上傳 `public/`＋`functions/`）
2. 建立 D1 資料庫（例：`subtracker-db`），在 Pages 專案 → Settings → Functions → D1 bindings 加上變數名 `DB`
3. 部署後首次呼叫任意 API 會自動建表（`ensureSchema`，同 shift-fill 自癒寫法）；或手動執行 `migrations/0001_schema.sql`
4. （選用）提醒 email：在 Pages → Settings → Environment variables 加上：
   - `RESEND_API_KEY`：Resend API 金鑰（到 resend.com 申請免費額度）
   - `REMIND_EMAIL`：收通知的 email
   - `RESEND_FROM`：（選用）寄件者，預設 `訂閱管家 <onboarding@resend.dev>`
   - 未設定時 `/api/due` 只回 JSON，不影響使用

## 提醒排程

用 [cron-job.org](https://cron-job.org)（免費）新增一個排程：

- URL：`https://你的網域/api/due`
- 頻率：每天一次（建議早上 8 點）
- 有到期項目＋有設 Resend 金鑰 → 自動寄 email；沒設 → 只記錄 JSON

## 本機開發

```bash
cd ~/workspace/sub-tracker
python3 -m http.server 8080 --directory public
# 開 http://localhost:8080（API 需接 Cloudflare 或用 wrangler）
npx wrangler pages dev public --d1 DB=subtracker-db
```

## 測試

```bash
node ~/workspace/sub-tracker-tests/test.js   # 32 個邏輯測試
```

## 第二版（未做）

Gmail 收據掃描、財政部電子發票 API 自動匯入、價格異動歷史、家庭分攤。
