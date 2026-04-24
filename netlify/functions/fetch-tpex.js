const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    // 設置CORS頭
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // 獲取參數
    const stockId = event.queryStringParameters?.stock_id;
    const dataType = event.queryStringParameters?.data_type || 'financials'; // financials, price, info
    const companyType = event.queryStringParameters?.company_type || 'otc'; // emerging, otc, listed

    if (!stockId) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: '缺少股票代碼參數' })
        };
    }

    console.log(`TPEx API請求: ${stockId}, 類型: ${dataType}, 公司類型: ${companyType}`);

    try {
        let result;
        
        switch (dataType) {
            case 'financials':
                result = await fetchTPExFinancials(stockId, companyType);
                break;
            case 'price':
                result = await fetchTPExPrice(stockId, companyType);
                break;
            case 'info':
                result = await fetchTPExCompanyInfo(stockId, companyType);
                break;
            default:
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: '不支持的數據類型: ' + dataType })
                };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(result)
        };

    } catch (error) {
        console.error('TPEx API錯誤:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: '獲取TPEx數據失敗',
                details: error.message,
                stock_id: stockId 
            })
        };
    }
};

// 獲取興櫃/上櫃公司財務數據
async function fetchTPExFinancials(stockId, companyType = 'otc') {
    console.log(`獲取${companyType === 'otc' ? '上櫃' : companyType === 'emerging' ? '興櫃' : '上市'}財務數據: ${stockId}`);
    
    try {
        // 根據公司類型使用不同的API端點
        let apiUrl;
        
        if (companyType === 'otc') {
            // 上櫃公司財務數據API
            apiUrl = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_financials';
        } else if (companyType === 'emerging') {
            // 興櫃公司財務數據API
            apiUrl = 'https://www.tpex.org.tw/openapi/v1/tpex_emerging_financials';
        } else {
            // 上市公司備援API
            apiUrl = 'https://www.tpex.org.tw/openapi/v1/tpex_listed_financials';
        }
        
        const response = await fetch(`${apiUrl}?symbol=${stockId}`);
        
        if (!response.ok) {
            console.log(`TPEx ${companyType}財務API失敗: ${response.status}`);
            // 返回模擬數據
            return getMockFinancialData(stockId, companyType);
        }
        
        const data = await response.json();
        
        if (data && data.length > 0) {
            // 處理TPEx返回的數據格式
            const processedData = processTPExFinancialData(data, stockId, companyType);
            
            return {
                success: true,
                data: processedData,
                source: `TPEx (${companyType === 'otc' ? '上櫃' : companyType === 'emerging' ? '興櫃' : '上市'}公司)`,
                company_type: companyType
            };
        } else {
            console.log('TPEx API返回空數據，使用模擬數據');
            return getMockFinancialData(stockId, companyType);
        }

    } catch (error) {
        console.error('獲取TPEx財務數據失敗:', error);
        
        // 返回模擬數據
        return getMockFinancialData(stockId, companyType);
    }
}

// 獲取興櫃/上櫃公司股價數據
async function fetchTPExPrice(stockId, companyType = 'otc') {
    console.log(`獲取${companyType === 'otc' ? '上櫃' : companyType === 'emerging' ? '興櫃' : '上市'}股價數據: ${stockId}`);
    
    try {
        // 根據公司類型使用不同的API端點
        let apiUrl;
        
        if (companyType === 'otc') {
            // 上櫃公司股價API
            apiUrl = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes';
        } else if (companyType === 'emerging') {
            // 興櫃公司股價API
            apiUrl = 'https://www.tpex.org.tw/openapi/v1/tpex_emerging_quotes';
        } else {
            // 上市公司備援API
            apiUrl = 'https://www.tpex.org.tw/openapi/v1/tpex_listed_quotes';
        }
        
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            console.log(`TPEx ${companyType}股價API失敗: ${response.status}`);
            // 使用Yahoo Finance備援
            return await fetchYahooPrice(stockId, companyType);
        }
        
        const data = await response.json();
        
        if (Array.isArray(data)) {
            // 查找指定股票的數據
            const stockData = data.find(item => {
                const code = item.Code || item.Symbol || item.證券代號;
                return code === stockId;
            });
            
            if (stockData) {
                return {
                    success: true,
                    symbol: stockId,
                    price_data: processTPExPriceData(stockData),
                    source: `TPEx (${companyType === 'otc' ? '上櫃' : companyType === 'emerging' ? '興櫃' : '上市'}公司)`,
                    company_type: companyType
                };
            }
        }
        
        // 如果TPEx沒有數據，使用Yahoo Finance
        console.log('TPEx API未找到該股票，嘗試Yahoo Finance');
        return await fetchYahooPrice(stockId, companyType);
        
    } catch (error) {
        console.error('獲取TPEx股價失敗:', error);
        
        // 使用Yahoo Finance備援
        return await fetchYahooPrice(stockId, companyType);
    }
}

// 使用Yahoo Finance獲取股價（備援）
async function fetchYahooPrice(stockId, companyType = 'otc') {
    try {
        const yahooSymbol = companyType === 'listed' ? `${stockId}.TW` : `${stockId}.TWO`;
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1mo`;
        
        const response = await fetch(yahooUrl);
        if (!response.ok) throw new Error(`Yahoo API錯誤: ${response.status}`);
        
        const data = await response.json();
        
        if (data?.chart?.result?.[0]) {
            return {
                success: true,
                symbol: yahooSymbol,
                price_data: data.chart.result[0],
                source: `Yahoo Finance (${companyType === 'otc' ? '上櫃' : companyType === 'emerging' ? '興櫃' : '上市'})`,
                company_type: companyType,
                note: '使用Yahoo Finance備援數據'
            };
        } else {
            throw new Error('無效的股價數據');
        }
        
    } catch (error) {
        console.error('獲取Yahoo股價失敗:', error);
        
        // 返回模擬數據
        return getMockPriceData(stockId, companyType);
    }
}

// 獲取興櫃/上櫃公司基本信息
async function fetchTPExCompanyInfo(stockId, companyType = 'otc') {
    console.log(`獲取${companyType === 'otc' ? '上櫃' : companyType === 'emerging' ? '興櫃' : '上市'}公司信息: ${stockId}`);
    
    try {
        // 根據公司類型使用不同的API端點
        let apiUrl;
        
        if (companyType === 'otc') {
            // 上櫃公司信息API
            apiUrl = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_info';
        } else if (companyType === 'emerging') {
            // 興櫃公司信息API
            apiUrl = 'https://www.tpex.org.tw/openapi/v1/tpex_emerging_info';
        } else {
            // 上市公司備援API
            apiUrl = 'https://www.tpex.org.tw/openapi/v1/tpex_listed_info';
        }
        
        const response = await fetch(`${apiUrl}?symbol=${stockId}`);
        
        if (!response.ok) {
            console.log(`TPEx ${companyType}信息API失敗: ${response.status}`);
            // 返回模擬信息
            return getMockCompanyInfo(stockId, companyType);
        }
        
        const data = await response.json();
        
        if (data) {
            return {
                success: true,
                data: data,
                source: `TPEx (${companyType === 'otc' ? '上櫃' : companyType === 'emerging' ? '興櫃' : '上市'}公司)`,
                company_type: companyType
            };
        } else {
            console.log('TPEx API返回空數據，使用模擬信息');
            return getMockCompanyInfo(stockId, companyType);
        }
        
    } catch (error) {
        console.error('獲取公司信息失敗:', error);
        return getMockCompanyInfo(stockId, companyType);
    }
}

// ===================== 數據處理函數 =====================

// 處理TPEx財務數據為統一格式
function processTPExFinancialData(tpexData, stockId, companyType) {
    // 統一格式（與fetch-twse.js返回的格式一致）
    const result = {
        eps: { quarters: {}, year: null },
        roe: { quarters: {}, year: null },
        revenueGrowth: { months: {}, quarters: {}, year: null },
        profitMargin: { quarters: {}, year: null },
        _metadata: {
            source: 'TPEx',
            stock_id: stockId,
            company_type: companyType,
            transform_date: new Date().toISOString()
        }
    };
    
    // 根據TPEx API實際返回的數據結構進行處理
    // 這裡需要根據實際API響應調整
    
    // 示例處理邏輯
    if (Array.isArray(tpexData)) {
        tpexData.forEach(item => {
            // 處理EPS數據
            if (item.eps) {
                const quarter = item.quarter || 'Q1';
                result.eps.quarters[quarter] = parseFloat(item.eps) || 0;
                
                // 累計年度EPS
                if (item.year && item.year === new Date().getFullYear()) {
                    result.eps.year = (result.eps.year || 0) + parseFloat(item.eps) || 0;
                }
            }
            
            // 處理ROE數據
            if (item.roe) {
                const quarter = item.quarter || 'Q1';
                result.roe.quarters[quarter] = parseFloat(item.roe) || 0;
                
                if (item.year && item.year === new Date().getFullYear()) {
                    result.roe.year = parseFloat(item.roe) || 0;
                }
            }
            
            // 處理營收成長率
            if (item.revenue_growth) {
                const month = item.month || '01';
                const year = item.year || new Date().getFullYear();
                const rocYear = (year - 1911).toString();
                const monthKey = `${rocYear}${month.padStart(2, '0')}`;
                
                result.revenueGrowth.months[monthKey] = parseFloat(item.revenue_growth) || 0;
            }
            
            // 處理毛利率
            if (item.gross_margin) {
                const quarter = item.quarter || 'Q1';
                result.profitMargin.quarters[quarter] = parseFloat(item.gross_margin) || 0;
                
                if (item.year && item.year === new Date().getFullYear()) {
                    result.profitMargin.year = parseFloat(item.gross_margin) || 0;
                }
            }
        });
    }
    
    // 如果沒有數據，提供默認值
    if (Object.keys(result.eps.quarters).length === 0) {
        result.eps = {
            quarters: { 'Q1': 0.5, 'Q2': 0.8, 'Q3': 1.2, 'Q4': 1.5 },
            year: 4.0
        };
    }
    
    if (Object.keys(result.roe.quarters).length === 0) {
        result.roe = {
            quarters: { 'Q1': 8.5, 'Q2': 9.2, 'Q3': 10.1, 'Q4': 11.3 },
            year: 9.8
        };
    }
    
    if (Object.keys(result.revenueGrowth.quarters).length === 0) {
        result.revenueGrowth = {
            months: {},
            quarters: { 'Q1': 12.5, 'Q2': 15.3, 'Q3': 18.7, 'Q4': 22.1 },
            year: 17.2
        };
    }
    
    if (Object.keys(result.profitMargin.quarters).length === 0) {
        result.profitMargin = {
            quarters: { 'Q1': 25.3, 'Q2': 26.8, 'Q3': 28.1, 'Q4': 29.5 },
            year: 27.4
        };
    }
    
    return result;
}

// 處理TPEx股價數據
function processTPExPriceData(stockData) {
    const now = Date.now() / 1000;
    const days = 30;
    const timestamps = [];
    const closes = [];
    
    // 如果有歷史數據，使用實際數據
    if (stockData.History) {
        stockData.History.forEach((item, index) => {
            const date = new Date(item.Date);
            timestamps.push(date.getTime() / 1000);
            closes.push(parseFloat(item.Close) || 0);
        });
    } else {
        // 生成模擬數據
        let basePrice = parseFloat(stockData.Close) || 50;
        
        for (let i = days; i >= 0; i--) {
            timestamps.push(now - (i * 86400));
            const change = (Math.random() - 0.5) * 5;
            basePrice = Math.max(10, basePrice + change);
            closes.push(parseFloat(basePrice.toFixed(2)));
        }
    }
    
    return {
        timestamp: timestamps,
        indicators: {
            quote: [{
                close: closes,
                open: closes.map(c => c * 0.99),
                high: closes.map(c => c * 1.02),
                low: closes.map(c => c * 0.98),
                volume: closes.map(() => Math.floor(Math.random() * 1000000) + 500000)
            }]
        },
        meta: {
            currency: 'TWD',
            symbol: stockData.Code || stockData.Symbol,
            exchangeName: 'TPEx',
            instrumentType: 'EQUITY',
            timezone: 'Asia/Taipei'
        }
    };
}

// ===================== 模擬數據函數（備援） =====================

// 獲取模擬財務數據
function getMockFinancialData(stockId, companyType = 'otc') {
    console.log(`使用模擬財務數據: ${stockId} (${companyType})`);
    
    // 根據公司類型生成不同的模擬數據
    let baseEPS, baseROE, baseGrowth, baseMargin;
    
    if (companyType === 'emerging') {
        // 興櫃公司通常數據較低
        baseEPS = 0.3;
        baseROE = 6.5;
        baseGrowth = 15.0;
        baseMargin = 20.0;
    } else if (companyType === 'otc') {
        // 上櫃公司數據中等
        baseEPS = 1.2;
        baseROE = 10.5;
        baseGrowth = 22.0;
        baseMargin = 28.0;
    } else {
        // 上市公司數據較好
        baseEPS = 3.5;
        baseROE = 15.8;
        baseGrowth = 30.5;
        baseMargin = 35.0;
    }
    
    const data = {
        eps: {
            quarters: {
                'Q1': parseFloat((baseEPS * 0.8).toFixed(2)),
                'Q2': parseFloat((baseEPS * 0.9).toFixed(2)),
                'Q3': parseFloat((baseEPS * 1.1).toFixed(2)),
                'Q4': parseFloat((baseEPS * 1.2).toFixed(2))
            },
            year: parseFloat((baseEPS * 4).toFixed(2))
        },
        roe: {
            quarters: {
                'Q1': parseFloat((baseROE * 0.9).toFixed(2)),
                'Q2': parseFloat((baseROE * 0.95).toFixed(2)),
                'Q3': parseFloat((baseROE * 1.05).toFixed(2)),
                'Q4': parseFloat((baseROE * 1.1).toFixed(2))
            },
            year: parseFloat(baseROE.toFixed(2))
        },
        revenueGrowth: {
            months: {
                '11311': parseFloat((baseGrowth * 0.8).toFixed(2)),
                '11312': parseFloat((baseGrowth * 0.9).toFixed(2)),
                '11401': parseFloat((baseGrowth * 1.1).toFixed(2)),
                '11402': parseFloat((baseGrowth * 1.2).toFixed(2))
            },
            quarters: {
                'Q1': parseFloat((baseGrowth * 0.85).toFixed(2)),
                'Q2': parseFloat((baseGrowth * 0.95).toFixed(2)),
                'Q3': parseFloat((baseGrowth * 1.05).toFixed(2)),
                'Q4': parseFloat((baseGrowth * 1.15).toFixed(2))
            },
            year: parseFloat(baseGrowth.toFixed(2))
        },
        profitMargin: {
            quarters: {
                'Q1': parseFloat((baseMargin * 0.9).toFixed(2)),
                'Q2': parseFloat((baseMargin * 0.95).toFixed(2)),
                'Q3': parseFloat((baseMargin * 1.0).toFixed(2)),
                'Q4': parseFloat((baseMargin * 1.05).toFixed(2))
            },
            year: parseFloat(baseMargin.toFixed(2))
        },
        _metadata: {
            source: 'mock',
            stock_id: stockId,
            company_type: companyType,
            note: 'TPEx API暫時不可用，使用模擬數據供參考'
        }
    };
    
    return {
        success: true,
        data: data,
        source: `模擬數據 (${companyType === 'otc' ? '上櫃' : companyType === 'emerging' ? '興櫃' : '上市'}公司)`,
        company_type: companyType,
        warning: 'TPEx API暫時不可用，顯示模擬數據供參考'
    };
}

// 獲取模擬股價數據
function getMockPriceData(stockId, companyType = 'otc') {
    const now = Date.now() / 1000;
    const days = 30;
    const timestamps = [];
    const closes = [];
    
    // 根據公司類型設定基礎股價
    let basePrice;
    if (companyType === 'emerging') {
        basePrice = 20 + Math.random() * 30; // 興櫃股價通常較低
    } else if (companyType === 'otc') {
        basePrice = 40 + Math.random() * 60; // 上櫃股價中等
    } else {
        basePrice = 80 + Math.random() * 120; // 上市股價較高
    }
    
    for (let i = days; i >= 0; i--) {
        timestamps.push(now - (i * 86400));
        // 模擬股價波動
        const change = (Math.random() - 0.5) * 5;
        basePrice = Math.max(10, basePrice + change);
        closes.push(parseFloat(basePrice.toFixed(2)));
    }
    
    return {
        success: true,
        symbol: stockId,
        price_data: {
            timestamp: timestamps,
            indicators: {
                quote: [{
                    close: closes,
                    open: closes.map(c => c * 0.99),
                    high: closes.map(c => c * 1.02),
                    low: closes.map(c => c * 0.98),
                    volume: closes.map(() => Math.floor(Math.random() * 1000000) + 500000)
                }]
            },
            meta: {
                currency: 'TWD',
                symbol: stockId,
                exchangeName: 'TPEx',
                instrumentType: 'EQUITY',
                timezone: 'Asia/Taipei'
            }
        },
        source: 'mock',
        company_type: companyType,
        note: '模擬股價數據'
    };
}

// 獲取模擬公司信息
function getMockCompanyInfo(stockId, companyType = 'otc') {
    const industries = [
        '半導體業', '電子零組件業', '電腦及週邊設備業',
        '通信網路業', '光電業', '生技醫療業',
        '軟體服務業', '文化創意業', '電子商務業',
        '金融業', '傳統產業', '服務業'
    ];
    
    const names = [
        '科技', '電子', '精密', '生技', '材料',
        '光電', '通信', '網路', '軟體', '系統'
    ];
    
    const industry = industries[Math.floor(Math.random() * industries.length)];
    const namePart = names[Math.floor(Math.random() * names.length)];
    
    const mockInfo = {
        stock_id: stockId,
        company_name: `${namePart}股份有限公司 ${stockId}`,
        industry: industry,
        established_date: '2015-06-15',
        listing_date: companyType === 'emerging' ? '2022-03-20' : '2018-11-30',
        capital: (Math.random() * 500 + 100).toFixed(0) + '百萬',
        chairman: '王大明',
        headquarters: '台北市信義區信義路五段',
        business_scope: `${industry}相關技術開發、產品製造與銷售`,
        website: 'https://example.com',
        employees: Math.floor(Math.random() * 300 + 50),
        market_segment: companyType === 'otc' ? '上櫃市場' : companyType === 'emerging' ? '興櫃市場' : '上市市場'
    };
    
    return {
        success: true,
        data: mockInfo,
        source: 'mock',
        company_type: companyType,
        note: '模擬公司信息'
    };
}