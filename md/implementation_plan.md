# 「立即分析」新增賣出建議面板 — 實作計劃（已確認版）

## 目標說明

在用戶點擊「立即分析」後，保留所有現有功能（評分表、AI 雙重分析、圖表），並在 K 線圖下方新增一個「**🔍 生成持倉建議**」按鈕，用戶主動點擊後展開「**持倉 / 空倉決策面板**」。

**用戶已確認的三項決策：**
1. ✅ 賣出價格計算方式：三種全部採用（EPS本益比 + 均線偏離 + 區間高點）
2. ✅ 籌碼面：串接 FinMind 新資料集，失敗則 TWSE 備援，都失敗顯示「資料無法取得」+ 「重新獲取」按鈕
3. ✅ 面板觸發方式：用戶手動點「🔍 生成持倉建議」按鈕
4. ✅ 完成後推送至 GitHub：`https://github.com/Joseph-pai/stock-risk-analysia`（Netlify 部署）

---

## 重要說明

> [!NOTE]
> 此計劃**完全不修改**現有「立即分析」、「評分表」、「AI 雙重分析」任何邏輯。
> 所有新增內容都是純擴充，在現有流程結束後附加執行。

---

## 完整修改內容

### 架構概覽

```
[現有] 立即分析按鈕 → 股票資訊 + 評分表 + K線圖
                                    ↓ (新增，K線圖下方插入按鈕)
                    [新增按鈕] 🔍 生成持倉建議
                                    ↓ (用戶點擊後)
                    [新增] 持倉 / 空倉決策面板（7個區塊）
```

---

## 檔案修改清單

### [NEW] `netlify/functions/fetch-chips.js`

全新 Netlify Function，負責籌碼面數據的後端代理。

**支援的資料集與優先順序：**

| 資料類型 | 主要來源 | 備援來源 |
|---------|---------|--------|
| 融資餘額 | FinMind `TaiwanStockMarginPurchaseShortSale` | TWSE `openapi.twse.com.tw/v1/exchangeReport/MI_MARGN` |
| 三大法人 | FinMind `TaiwanStockInstitutionalInvestors` | TWSE `openapi.twse.com.tw/v1/exchangeReport/TWT38U` |

**查詢參數：**
- `stock_id`：股票代碼
- `token`：FinMind Token（有則優先，無則跳 TWSE）
- `data_type`：`margin`（融資）或 `institutional`（法人）

**回傳格式（成功）：**
```json
{
  "success": true,
  "source": "FinMind | TWSE",
  "data": {
    "margin_balance": 12345,          // 融資餘額（張）
    "margin_change": -234,            // 融資增減
    "margin_trend": "increasing",     // 趨勢：increasing/decreasing/stable
    "foreign_buy": 1500,              // 外資買超（張）
    "foreign_net": 800,               // 外資淨買超
    "foreign_consecutive": 3,         // 外資連買/賣天數（正=連買，負=連賣）
    "trust_buy": 200,                 // 投信買超
    "trust_net": 150,
    "trust_consecutive": 2,
    "date": "2025-04-24"
  }
}
```

**回傳格式（失敗）：**
```json
{ "success": false, "source": "none", "error": "資料無法取得" }
```

---

### [MODIFY] `index.html`

#### 修改點 1：`onsubmit` 函數尾端（第 4929~4934 行附近）

在 `log('分析完成...')` 之前，插入「生成持倉建議」按鈕到結果區：

```javascript
// 插入持倉建議觸發按鈕（在 K 線圖下方）
const decisionBtnHtml = `
    <div class="text-center mt-4" id="decisionBtnContainer">
        <button class="btn btn-warning btn-lg fw-bold px-5 py-3"
            onclick="loadDecisionPanel('${symbol}','${stockName}',${price},closes_snapshot,${risePercent},${techScore},${marketScore})">
            🔍 生成持倉 / 空倉建議
        </button>
        <p class="text-white-50 small mt-2">點擊後將載入籌碼面數據並計算賣出參考價</p>
    </div>
    <div id="decisionPanel"></div>
`;
document.getElementById('result').insertAdjacentHTML('beforeend', decisionBtnHtml);
// 快照 closes（避免閉包問題）
window._decisionData = { symbol, stockName, price: parseFloat(price), closes, risePercent: parseFloat(risePercent), techScore, marketScore };
```

> [!NOTE]
> 按鈕使用 `window._decisionData` 傳遞快照，避免按鈕的 onclick 字串過長。onclick 改為 `loadDecisionPanel()`。

#### 修改點 2：新增 `loadDecisionPanel()` 函數

位置：在 `updateTotalScore()` 函數之後（第 4285 行後）新增。

**函數流程：**
1. 顯示載入中動畫
2. 呼叫 `fetchChipsData(symbol, token)` 取得籌碼面數據
3. 計算三種賣出目標價
4. 計算 20MA
5. 執行空倉檢查清單（6 項）
6. 渲染完整 HTML 面板

#### 修改點 3：新增 `fetchChipsData()` 函數

```javascript
async function fetchChipsData(stockId) {
    try {
        const token = TOKEN || '';
        const [marginRes, institutionalRes] = await Promise.all([
            fetch(`/.netlify/functions/fetch-chips?stock_id=${stockId}&data_type=margin&token=${token}`),
            fetch(`/.netlify/functions/fetch-chips?stock_id=${stockId}&data_type=institutional&token=${token}`)
        ]);
        const margin = await marginRes.json();
        const institutional = await institutionalRes.json();
        return { margin, institutional };
    } catch(e) {
        return { margin: { success: false }, institutional: { success: false } };
    }
}
```

#### 修改點 4：新增 CSS 樣式（`<style>` 尾端）

約 50 行，涵蓋：
- `.decision-panel`：面板主容器
- `.target-price-card`（保守/合理/樂觀 三色）
- `.check-item`：清單項目的 ✅ ❌ ⚠️ 顯示
- `.chips-block`：籌碼數據顯示區
- `.recommendation-box`（🔴🟠🟡🟢 四等級色彩）

---

## 面板結構（7個區塊詳細說明）

### 區塊 1：現價資訊
| 項目 | 計算 | 說明 |
|------|------|------|
| 目前價格 | `price`（日 K 最後收盤） | 即分析日期範圍末日收盤 |
| 區間最高 | `Math.max(...closes)` | 所選期間最高收盤 |
| 區間最低 | `Math.min(...closes)` | 所選期間最低收盤 |
| 距高點 | `(price-high)/high*100` | >-10% 顯示 ⚠️ 接近高點 |
| 期間漲跌 | `risePercent` | 直接使用已計算值 |

### 區塊 2：本益比目標價（EPS×PE 法）
```
保守出場價 = EPS × 12  → 傳產/低成長股合理出場
合理出場價 = EPS × 18  → 台股市場平均本益比
樂觀持有價 = EPS × 25  → 成長股溢價天花板
```
每個價格標示「現價距目標：+X.X%（還有上漲空間）/ -X.X%（已超估值）」

EPS 無效時顯示：`❌ EPS 無效或為負，本益比法不適用，請以技術面為準`

### 區塊 3：均線技術賣出參考（MA 計算法）
```javascript
const n = Math.min(20, closes.length);
const ma20 = closes.slice(-n).reduce((a,b)=>a+b,0) / n;
```
| 參考點 | 計算 | 意義 |
|-------|------|------|
| 20MA | `ma20` | 跌破即警戒線 |
| 輕度壓力 | `ma20 × 1.05` | 可考慮部分出場 |
| 強壓力位 | `ma20 × 1.10` | 積極減碼目標 |
| 區間高點 | `Math.max(...closes)` | 短線天花板 |

### 區塊 4：區間高點係數法
```
保守目標 = 區間高點 × 0.90  → 比高點低10%即跑
中性目標 = 區間高點 × 0.95  → 距高點5%開始減碼  
區間高點 = Math.max(...closes) → 最樂觀目標
```

### 區塊 5：空倉自動檢查清單（6 項）
| 項目 | 判斷邏輯 | 警示等級 |
|------|---------|--------|
| 均線位置 | `price < ma20` | ❌ 跌破20MA |
| 月營收 YoY | 最新月 < 0 | ❌ 營收衰退 |
| 毛利率趨勢 | 最新季 < 前一季 | ⚠️ 毛利下滑 |
| 大盤關係 | `marketScore < 0` | ❌ 弱於大盤 |
| EPS 狀況 | `eps.year < 0` | ❌ 年度虧損 |
| 區間跌幅 | `risePercent < -15` | ❌ 下跌趨勢 |

### 區塊 6：籌碼面數據（串接 FinMind + TWSE 備援）

**融資餘額顯示：**
- 融資餘額 X 張 ｜ 本日增減：+X 張
- 趨勢判斷：🔺 連續增加（散戶追高，注意風險）/ 🔻 持續減少（籌碼清洗）

**三大法人顯示：**
- 外資：買超 +X 張 ｜ 已連續 X 天買入 / 賣出
- 投信：買超 +X 張 ｜ 趨勢
- 自營商：買超 +X 張

**失敗時：**
```
資料無法取得  [🔄 重新獲取]
```
「重新獲取」按鈕呼叫 `retryChipsData(symbol)` 函數，有 3 秒 cooldown 防止連點。

### 區塊 7：綜合建議（依空倉清單 ❌ 數量自動判斷）
| ❌ 數量 | 等級 | 建議文字 |
|--------|------|--------|
| 0 | 🟢 持倉 | 各項指標穩健，可維持持倉。建議以「合理出場價」作為停利目標，注意是否有大盤異常。 |
| 1 | 🟡 觀望 | 出現單一風險警示，建議降低倉位至 50%，密切關注下月 10 日營收公告。 |
| 2 | 🟠 減碼 | 多項風險訊號觸發，建議降至 20% 輕倉，以「保守出場價」為停損參考。 |
| ≥3 | 🔴 空倉 | 風險訊號達 3 項以上，建議出清持倉，等待空倉訊號改善（營收翻正、均線回穩）再進場。 |

---

## 精確修改位置

### `netlify/functions/fetch-chips.js`
- **新增**：全新檔案，約 180 行

### `index.html`
- **第 4929 行前**：插入 `decisionBtnHtml` 字串和 `window._decisionData` 快照（新增約 15 行）
- **第 4285 行後**：新增 `loadDecisionPanel()` 函數（約 200 行）
- **第 4285 行後**：新增 `fetchChipsData()` 函數（約 25 行）
- **第 4285 行後**：新增 `retryChipsData()` 函數（約 20 行）
- **`<style>` 結尾**：新增面板 CSS（約 60 行）

**完全不修改任何現有函數。**

---

## 完成後 GitHub 推送步驟

```bash
cd "/Users/joseph/Downloads/tw-TPEx-Analysis-main 2"
git add .
git commit -m "feat: 新增持倉/空倉決策面板（賣出目標價+籌碼面分析）"
git push origin main
```

> [!NOTE]
> 推送目標：`https://github.com/Joseph-pai/stock-risk-analysia`
> Netlify 設定：Functions 目錄已是 `netlify/functions`，新增的 `fetch-chips.js` 自動部署，無需修改 `netlify.toml`。

---

## 修改量總覽

| 檔案 | 類型 | 新增行數 | 修改行數 |
|------|------|---------|--------|
| `fetch-chips.js` | 新增檔案 | ~180 | 0 |
| `index.html` | 擴充 | ~320 | 0 |
| `netlify.toml` | 不動 | 0 | 0 |
| **合計** | | **~500** | **0** |

---

---

### 新增內容一：`generateDecisionPanel()` JS 函數

新增一個純函數，在 `updateTotalScore()` 呼叫後執行。輸入如下變數（皆已存在於現有分析流程中）：

| 輸入變數 | 來源 |
|---------|------|
| `price` | 區間最後收盤價（已有） |
| `closes[]` | 歷史收盤價陣列（已有） |
| `timestamps[]` | 時間戳陣列（已有） |
| `risePercent` | 區間漲跌幅（已有） |
| `financialCache.eps.year` | 年度 EPS（已有） |
| `financialCache.roe.year` | 年度 ROE（已有） |
| `financialCache.revenueGrowth.months` | 月營收 YoY（已有） |
| `financialCache.profitMargin.quarters` | 毛利率（已有） |
| `techScore, marketScore` | 技術面/市場面評分（已有） |
| `stockName, symbol` | 股票名稱與代碼（已有） |

---

### 新增內容二：決策面板 HTML 結構

在 `resultEl.innerHTML` 渲染後，透過 `document.getElementById('result').insertAdjacentHTML('beforeend', ...)` 插入以下區塊（不改動原有 innerHTML）：

#### 面板結構（6 個卡片區塊）

````
┌──────────────────────────────────────────────────────────────┐
│  💰 持倉 / 空倉決策參考面板  [symbol stockName]              │
├─────────────────┬────────────────────────────────────────────┤
│  📌 現價資訊    │  目前價格 / 區間高低點 / 距高點跌幅        │
├─────────────────┴────────────────────────────────────────────┤
│  📊 基本面賣出目標價（3情境）                                 │
│  ┌──────────┬─────────────────┬──────────────────────────┐  │
│  │ 情境     │ 目標價          │ 計算說明                  │  │
│  │ 保守出場 │ EPS × 12倍      │ 低估值，優先保本           │  │
│  │ 合理出場 │ EPS × 18倍      │ 市場平均本益比             │  │
│  │ 樂觀持有 │ EPS × 25倍      │ 成長股溢價，需基本面支撐   │  │
│  └──────────┴─────────────────┴──────────────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│  📈 技術面賣出參考（MA 計算）                                 │
│  20MA 均線 / 20MA+5% / 20MA+10% / 區間高點                   │
├──────────────────────────────────────────────────────────────┤
│  🚦 空倉檢查清單（5項）                                      │
│  ✅/❌  均線位置  / 營收 YoY / 毛利率趨勢 / 大盤關係 / EPS   │
├──────────────────────────────────────────────────────────────┤
│  📋 籌碼面提示（缺少數據說明 + 外部查詢連結）                │
├──────────────────────────────────────────────────────────────┤
│  🔴/🟡/🟢  綜合建議文字（持倉 / 減碼 / 空倉）               │
└──────────────────────────────────────────────────────────────┘
````

---

### 詳細計算邏輯

#### 1. 現價資訊區
- **目前價格**：`price`（日期範圍最後收盤）
- **區間最高價**：`Math.max(...closes)`
- **區間最低價**：`Math.min(...closes)`
- **距高點跌幅**：`((price - high) / high * 100).toFixed(1)%`
- **說明文字**：距高點跌幅 > -10% → ⚠️ 接近高點，注意風險；< -30% → 🟢 已修正至低位

#### 2. 基本面賣出目標價（EPS 本益比法）
```
保守出場價 = EPS × 12  （台股傳產平均 PE）
合理出場價 = EPS × 18  （台股科技平均 PE）
樂觀持有價 = EPS × 25  （成長股 PE 上限）
```
- 若 EPS 為負或無數據：顯示「❌ EPS 無效，本益比法不適用」
- 每個價格後標示「現價距目標：+X% / -X%」讓用戶直接看懂距離

#### 3. 技術面賣出參考（均線計算）
用 `closes[]` 計算：
```javascript
// 20MA（取最後20根收盤的平均）
const ma20 = closes.slice(-20).reduce((a,b) => a+b, 0) / Math.min(20, closes.length)
```
- **20MA**：趨勢均線（跌破即警戒）
- **20MA × 1.05**：輕度壓力位
- **20MA × 1.10**：強壓力位（可考慮減碼）
- **區間最高點**：短線天花板

#### 4. 空倉檢查清單（自動判斷 ✅ / ❌ / ⚠️）

| 項目 | 判斷邏輯 | 資料來源 |
|------|---------|---------|
| 均線位置 | `price < ma20` → ❌ 跌破季線 | `closes[]` 計算 |
| 營收 YoY | 最新月 YoY < 0 → ❌ 衰退 | `financialCache.revenueGrowth.months` |
| 毛利率趨勢 | 最近一季 < 前一季 → ⚠️ 下滑 | `financialCache.profitMargin.quarters` |
| 大盤關係 | `marketScore < 0` → ❌ 弱於大盤 | `marketScore`（已計算） |
| EPS 風險 | `eps.year < 0` → ❌ 虧損 | `financialCache.eps.year` |
| 區間跌幅 | `risePercent < -10` → ❌ 跌勢明確 | `risePercent`（已計算） |

觸發 **≥ 2 項 ❌** → 顯示空倉建議

#### 5. 籌碼面提示區（靜態提示）
```
⚠️ 以下籌碼數據本系統尚未整合，建議手動查詢：
• 融資餘額變化 → [台灣證交所查詢]  [連結]
• 三大法人買賣超 → [證交所法人動態] [連結]
• 投信持股比例  → [公開資訊觀測站] [連結]
```

#### 6. 綜合建議文字（根據空倉清單觸發數自動判斷）

| 觸發數 | 建議等級 | 建議文字 |
|--------|---------|---------|
| 0 項 ❌ | 🟢 持倉 | 各項指標穩健，可維持持倉，以合理出場價作為停利目標 |
| 1 項 ❌ | 🟡 觀望 | 出現單一風險警示，建議降低倉位至 50%，觀察下月營收公告 |
| 2 項 ❌ | 🟠 減碼 | 多項風險訊號觸發，建議降至 20% 輕倉，以保守出場價為停損 |
| ≥ 3 項 ❌ | 🔴 空倉 | 風險訊號達 3 項以上，建議出清持倉，等待訊號改善後再進場 |

---

## 修改範圍（精確）

### 修改的檔案

#### [MODIFY] [index.html](file:///Users/joseph/Downloads/tw-TPEx-Analysis-main%202/index.html)

**修改 1：在 `onsubmit` 函數尾端（`updateTotalScore()` 呼叫後）新增一行呼叫**
- 位置：約第 4750 行附近（`setupPeriodChangeListeners()` 之後）
- 新增：`generateDecisionPanel(price, closes, timestamps, risePercent, techScore, marketScore, symbol, stockName);`

**修改 2：新增 `generateDecisionPanel()` 函數**
- 位置：在 `updateTotalScore()` 函數定義之後（約 4285 行後）新增完整函數
- 不修改任何現有函數

**修改 3：新增面板所需 CSS 樣式**
- 位置：`<style>` 區塊尾端新增約 30 行樣式
- 包含：面板卡片、情境價格色彩、建議等級色彩、清單 icon 顏色

---

## 驗證計劃

- 點擊「立即分析」後，原有評分表與圖表正常顯示
- 決策面板自動出現在圖表下方
- 當 EPS 無效時，本益比區不顯示無效數字
- 當 K 線數據少於 20 根時，MA20 計算採用實際可用根數
- AI 分析功能按鈕仍正常運作（不受影響）

---

## 總修改量估算

- **新增 JS**：約 150 行（純新增，無刪改）
- **新增 CSS**：約 30 行（純新增）
- **修改現有代碼**：僅 1 行（新增一個函數呼叫）
- **風險等級**：低（不影響任何現有路徑）
