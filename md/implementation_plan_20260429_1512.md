# 實作計畫：修復上櫃公司資料缺失與優化搜尋範圍鎖定

## 變更摘要
1. **後端 (`check-company-type.js`)**：將上櫃公司的資料來源改為涵蓋全量上櫃公司 (包含KY股) 的 `mopsfin_t187ap03_O` API。
2. **前端 (`index.html`)**：在進行搜尋與資料讀取時，加入「鎖定搜尋範圍」的邏輯。點擊上櫃等按鈕時，搜尋結果會自動過濾為該類型。發送籌碼資料請求時，會將 `company_type` 傳給後端。
3. **後端 (`fetch-chips.js`)**：當 `company_type=otc` 時，若 FinMind 失效，將自動切換為櫃買中心 (TPEx) 專屬的 `margin_bal_result.php` (融資餘額) 與 `3itrade_hedge_result.php` (三大法人) 備援 API。

> [!IMPORTANT]
> **需要使用者審查**
> 請確認上述修正邏輯是否符合您的預期？如果沒有問題，我將幫您：
> 1. 先為目標檔案建立包含日期時間的備份檔。
> 2. 進行代碼修改與測試。
> 3. 確認無誤後，推送到 GitHub 上。

## 具體修改內容

### 1. `netlify/functions/check-company-type.js`
- **[MODIFY]** 修改 `checkOTCCompany` 函數。
  - 將 URL 從 `https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes` 改為 `https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O`。
  - 修改對應的 JSON 解析邏輯：尋找 `SecuritiesCompanyCode` (公司代號)、`CompanyName` (公司名稱) 和 `CompanyAbbreviation` (公司簡稱) 來進行比對，確保 8455 也能順利找到。

### 2. `index.html`
- **[MODIFY]** 優化搜尋與後端呼叫邏輯。
  - 將選擇「公司類型 (自動檢測、上市、上櫃、興櫃)」與搜尋建議清單的過濾邏輯連動，達到「鎖定搜尋範圍」的效果。
  - 確保從 `fetchChipsData` (或者相對應的 AJAX 呼叫) 送出 API 請求時，將 `&company_type=` 參數附加在 URL 上，傳送給 `fetch-chips.js`。

### 3. `netlify/functions/fetch-chips.js`
- **[MODIFY]** 增加 `company_type` 判斷與 TPEx 備援 API。
  - 增加日期轉換函數 `getTaiwanDate()` 將西元日期 (YYYY-MM-DD) 轉換為民國年格式 (如 `115/04/28`) 以符合 TPEx 規範。
  - 在 `fetchMarginData` 加入判斷：若為上櫃 (`otc`)，則向 `https://www.tpex.org.tw/web/stock/margin_trading/margin_balance/margin_bal_result.php` 抓取資料，並解析 JSON 陣列 (Index 6 為今日餘額，Index 2 為前日餘額)。
  - 在 `fetchInstitutionalData` 加入判斷：若為上櫃 (`otc`)，則向 `https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php` 抓取資料，並解析 JSON 陣列 (外資 Index 10, 投信 Index 13, 自營商 Index 22)。

## 測試計畫
1. 選擇 `companyType` 為「上櫃公司」，輸入 `8455`，確認能抓取並顯示「大拓-KY」。
2. 清除 Token 或模擬 FinMind 失效，確保對於 `8455` 或其他上櫃股票，依然能抓到三大法人與融資餘額資料。
