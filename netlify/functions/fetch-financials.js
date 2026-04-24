const fetch = require('node-fetch'); // Netlify Functions 預設支持 node-fetch

/**
 * Netlify Function 專門用於安全、穩定地從 Yahoo Finance 獲取財報數據
 * 這樣可以繞過瀏覽器端的 CORS 限制。
 */
exports.handler = async (event, context) => {
    // 设置CORS头
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS, POST'
    };

    // 处理预检请求
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    // 獲取前端傳入的參數
    const stockId = event.queryStringParameters.id;
    const companyType = event.queryStringParameters.type || 'listed'; // listed, otc, emerging

    if (!stockId) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Missing stock ID (id parameter)' }),
        };
    }

    // 根据公司类型决定 Yahoo Finance 符号
    let symbol;
    switch(companyType) {
        case 'listed':
            symbol = `${stockId}.TW`;
            break;
        case 'otc':
        case 'emerging':
            symbol = `${stockId}.TWO`;
            break;
        default:
            symbol = `${stockId}.TW`; // 默認上市公司
    }

    console.log(`Fetching financial data for: ${symbol} (Type: ${companyType})`);

    // 請求 Yahoo Finance 的 quoteSummary API，包含 defaultKeyStatistics 和 financialData 兩個模組
    const yahooUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=defaultKeyStatistics,financialData`;

    try {
        // 在伺服器端發起請求，不受 CORS 限制
        const response = await fetch(yahooUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (!response.ok) {
            console.error(`Yahoo API error for ${symbol}: ${response.status} ${response.statusText}`);
            
            // 返回降级数据
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    defaultKeyStatistics: {
                        trailingEps: { raw: null, fmt: 'N/A' }
                    },
                    financialData: {
                        returnOnEquity: { raw: null, fmt: 'N/A' },
                        revenueGrowth: { raw: null, fmt: 'N/A' },
                        grossMargins: { raw: null, fmt: 'N/A' }
                    },
                    _metadata: {
                        source: 'Yahoo Finance (fallback)',
                        symbol: symbol,
                        company_type: companyType,
                        success: false,
                        message: `Yahoo API error: ${response.statusText}`
                    }
                }),
            };
        }

        const data = await response.json();
        
        // 檢查數據結構是否正確
        if (data?.quoteSummary?.result?.[0]) {
            const result = data.quoteSummary.result[0];
            
            // 添加元数据
            result._metadata = {
                source: 'Yahoo Finance',
                symbol: symbol,
                company_type: companyType,
                success: true,
                retrieved_at: new Date().toISOString()
            };
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(result),
            };
        } else {
            console.error('Yahoo Finance returned invalid data structure');
            
            // 返回降级数据
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    defaultKeyStatistics: {
                        trailingEps: { raw: null, fmt: 'N/A' }
                    },
                    financialData: {
                        returnOnEquity: { raw: null, fmt: 'N/A' },
                        revenueGrowth: { raw: null, fmt: 'N/A' },
                        grossMargins: { raw: null, fmt: 'N/A' }
                    },
                    _metadata: {
                        source: 'Yahoo Finance (fallback)',
                        symbol: symbol,
                        company_type: companyType,
                        success: false,
                        message: 'Invalid data structure from Yahoo Finance'
                    }
                }),
            };
        }

    } catch (error) {
        console.error('Function error:', error);
        
        // 返回降级数据
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                defaultKeyStatistics: {
                    trailingEps: { raw: null, fmt: 'N/A' }
                },
                financialData: {
                    returnOnEquity: { raw: null, fmt: 'N/A' },
                    revenueGrowth: { raw: null, fmt: 'N/A' },
                    grossMargins: { raw: null, fmt: 'N/A' }
                },
                _metadata: {
                    source: 'Yahoo Finance (error fallback)',
                    symbol: symbol || `${stockId}.TW`,
                    company_type: companyType,
                    success: false,
                    message: `Internal server error: ${error.message}`,
                    error: error.message
                }
            }),
        };
    }
};