const fetch = require('node-fetch');

/**
 * Netlify Function 專用於獲取 Yahoo Finance 的股價 (Chart) 數據
 */
exports.handler = async (event, context) => {
    // 獲取前端傳入的股票代碼 (e.g., id=2330.TW or ^TWII)
    const symbol = event.queryStringParameters.id; 

    if (!symbol) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing stock symbol (id parameter)' }),
        };
    }

    // Yahoo Finance Chart API (v8)
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y`;

    try {
        const response = await fetch(yahooUrl);
        
        if (!response.ok) {
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: `Yahoo API response error: ${response.statusText}` }),
            };
        }

        const data = await response.json();
        
        // 檢查數據結構是否正確
        if (data?.chart?.result?.[0]) {
            return {
                statusCode: 200,
                // 返回完整的 Yahoo Chart 數據結構
                body: JSON.stringify(data),
            };
        } else {
             return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Yahoo Finance did not return price data.' }),
            };
        }

    } catch (error) {
        console.error('Function error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `Internal server error: ${error.message}` }),
        };
    }
};