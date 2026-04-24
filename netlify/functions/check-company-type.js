const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    // 設置CORS頭
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS, POST'
    };

    // 處理預檢請求
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    // 獲取股票代碼
    const stockCode = event.queryStringParameters?.stock_code || 
                     (event.body ? JSON.parse(event.body).stock_code : null);

    if (!stockCode) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: '缺少股票代碼參數' })
        };
    }

    console.log(`開始檢測公司類型: ${stockCode}`);

    try {
        let result = {
            stock_code: stockCode,
            type: 'not_found',
            stock_name: '',
            source: '',
            suggestions: []
        };

        // 1. 先嘗試查詢上市公司（TWSE）
        console.log(`嘗試查詢上市公司 (TWSE): ${stockCode}`);
        const listedResult = await checkListedCompany(stockCode);
        
        if (listedResult.found) {
            console.log(`✅ 找到上市公司: ${listedResult.stock_name}`);
            result.type = 'listed';
            result.stock_name = listedResult.stock_name;
            result.source = 'TWSE';
            result.suggestions = listedResult.suggestions || [];
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(result)
            };
        }

        // 2. 嘗試查詢上櫃公司（TPEx OTC）
        console.log(`嘗試查詢上櫃公司 (TPEx OTC): ${stockCode}`);
        const otcResult = await checkOTCCompany(stockCode);
        
        if (otcResult.found) {
            console.log(`✅ 找到上櫃公司: ${otcResult.stock_name}`);
            result.type = 'otc';
            result.stock_name = otcResult.stock_name;
            result.source = 'TPEx_OTC';
            result.suggestions = otcResult.suggestions || [];
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(result)
            };
        }

        // 3. 嘗試查詢興櫃公司（TPEx Emerging）
        console.log(`嘗試查詢興櫃公司 (TPEx Emerging): ${stockCode}`);
        const emergingResult = await checkEmergingCompany(stockCode);
        
        if (emergingResult.found) {
            console.log(`✅ 找到興櫃公司: ${emergingResult.stock_name}`);
            result.type = 'emerging';
            result.stock_name = emergingResult.stock_name;
            result.source = 'TPEx_EM';
            result.suggestions = emergingResult.suggestions || [];
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(result)
            };
        }

        // 4. 如果都沒找到，根據股票代碼特徵自動判斷
        console.log(`❌ 未找到公司: ${stockCode}，嘗試根據代碼特徵判斷`);
        
        // 根據股票代碼特徵自動判斷
        if (/^\d{4}$/.test(stockCode)) {
            if (stockCode.startsWith('6')) {
                // 以6開頭通常是興櫃公司
                result.type = 'emerging';
                result.stock_name = `興櫃公司 ${stockCode}`;
                result.source = '自動判斷 (代碼特徵)';
                result.suggestions = ['根據股票代碼特徵判斷為興櫃公司'];
                
                console.log(`✅ 根據代碼特徵判斷為興櫃公司: ${stockCode}`);
                
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(result)
                };
            } else {
                // 其他4位數字代碼通常是上櫃公司
                result.type = 'otc';
                result.stock_name = `上櫃公司 ${stockCode}`;
                result.source = '自動判斷 (代碼特徵)';
                result.suggestions = ['根據股票代碼特徵判斷為上櫃公司'];
                
                console.log(`✅ 根據代碼特徵判斷為上櫃公司: ${stockCode}`);
                
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(result)
                };
            }
        }

        // 5. 如果代碼格式不對，提供建議
        console.log(`❌ 無法判斷公司類型: ${stockCode}`);
        result.suggestions = generateSuggestions(stockCode);
        
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify(result)
        };

    } catch (error) {
        console.error('檢測公司類型錯誤:', error);
        
        // 錯誤時也嘗試根據代碼特徵判斷
        let fallbackType = 'not_found';
        let fallbackName = stockCode;
        let fallbackSource = '錯誤降級判斷';
        
        if (/^\d{4}$/.test(stockCode)) {
            if (stockCode.startsWith('6')) {
                fallbackType = 'emerging';
                fallbackName = `興櫃公司 ${stockCode}`;
            } else {
                fallbackType = 'otc';
                fallbackName = `上櫃公司 ${stockCode}`;
            }
            
            console.log(`錯誤降級：根據代碼特徵判斷為 ${fallbackType}: ${stockCode}`);
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    stock_code: stockCode,
                    type: fallbackType,
                    stock_name: fallbackName,
                    source: fallbackSource,
                    suggestions: ['API錯誤，根據代碼特徵自動判斷']
                })
            };
        }
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: '檢測公司類型失敗',
                details: error.message,
                stock_code: stockCode 
            })
        };
    }
};

// 檢查是否為上市公司（TWSE）
async function checkListedCompany(stockCode) {
    try {
        // 方法1: 通過TWSE API查詢
        const twseUrl = 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(twseUrl, { 
            signal: controller.signal 
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            console.log('TWSE API請求失敗，嘗試方法2');
            // 方法2: 通過代碼模式判斷（上市公司通常是4位數字）
            if (/^\d{4}$/.test(stockCode)) {
                // 檢查是否可能是上櫃或興櫃
                if (stockCode.startsWith('6')) {
                    return { 
                        found: false,
                        suggestions: ['此代碼以6開頭，可能是興櫃公司'] 
                    };
                }
                // 不是6開頭的4位數字，可能是上櫃公司
                return { 
                    found: false,
                    suggestions: ['此代碼不是6開頭，可能是上櫃公司'] 
                };
            }
            return { found: false };
        }

        const data = await response.json();
        
        // 查找匹配的股票
        const foundStock = data.find(item => 
            item['公司代號'] === stockCode || 
            item['公司簡稱'] === stockCode ||
            item['公司名稱'] === stockCode
        );

        if (foundStock) {
            return {
                found: true,
                stock_name: foundStock['公司名稱'] || foundStock['公司簡稱'],
                stock_id: foundStock['公司代號'],
                industry: foundStock['產業別']
            };
        }

        return { found: false };
    } catch (error) {
        console.log('檢查上市公司失敗:', error.message);
        return { 
            found: false,
            suggestions: ['TWSE API查詢失敗，請手動選擇公司類型']
        };
    }
}

// 檢查是否為上櫃公司（TPEx OTC）
async function checkOTCCompany(stockCode) {
    try {
        // 上櫃公司查詢 - 使用TPEx公開API
        const tpexUrl = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(tpexUrl, { 
            signal: controller.signal 
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            console.log('TPEx OTC API請求失敗，嘗試方法2');
            // 方法2: 通過代碼特徵判斷
            if (/^\d{4}$/.test(stockCode)) {
                // 上櫃公司通常是4位數字，但不是6開頭
                if (!stockCode.startsWith('6')) {
                    return { 
                        found: true, 
                        stock_name: `上櫃公司 ${stockCode}`,
                        suggestions: ['嘗試通過TPEx公開資料獲取數據']
                    };
                }
            }
            return { found: false };
        }

        const data = await response.json();
        
        // TPEx API返回的數據格式可能不同，需要根據實際情況調整
        if (Array.isArray(data)) {
            const foundStock = data.find(item => {
                const code = item.Code || item.Symbol || item.證券代號;
                const name = item.Name || item.公司名稱 || item.證券名稱;
                
                return code === stockCode || 
                       name === stockCode ||
                       name?.includes(stockCode);
            });

            if (foundStock) {
                return {
                    found: true,
                    stock_name: foundStock.Name || foundStock.證券名稱 || foundStock.公司名稱,
                    stock_id: foundStock.Code || foundStock.Symbol || foundStock.證券代號,
                    source: 'TPEx_OTC'
                };
            }
        }

        return { found: false };
    } catch (error) {
        console.log('檢查上櫃公司失敗:', error.message);
        return { 
            found: false,
            suggestions: ['TPEx OTC API查詢失敗，請手動選擇公司類型']
        };
    }
}

// 檢查是否為興櫃公司（TPEx Emerging）
async function checkEmergingCompany(stockCode) {
    try {
        // 興櫃公司查詢 - 使用TPEx公開API
        const tpexUrl = 'https://www.tpex.org.tw/openapi/v1/tpex_emerging_quotes';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(tpexUrl, { 
            signal: controller.signal 
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            console.log('TPEx Emerging API請求失敗，嘗試方法2');
            // 方法2: 通過代碼特徵判斷（興櫃通常是4位數字，以6開頭）
            if (/^\d{4}$/.test(stockCode) && stockCode.startsWith('6')) {
                return { 
                    found: true, 
                    stock_name: `興櫃公司 ${stockCode}`,
                    suggestions: ['嘗試通過TPEx公開資料獲取數據']
                };
            }
            return { found: false };
        }

        const data = await response.json();
        
        if (Array.isArray(data)) {
            const foundStock = data.find(item => {
                const code = item.Code || item.Symbol || item.證券代號;
                const name = item.Name || item.公司名稱 || item.證券名稱;
                
                return code === stockCode || 
                       name === stockCode ||
                       name?.includes(stockCode);
            });

            if (foundStock) {
                return {
                    found: true,
                    stock_name: foundStock.Name || foundStock.證券名稱 || foundStock.公司名稱,
                    stock_id: foundStock.Code || foundStock.Symbol || foundStock.證券代號,
                    source: 'TPEx_EM'
                };
            }
        }

        return { found: false };
    } catch (error) {
        console.log('檢查興櫃公司失敗:', error.message);
        return { 
            found: false,
            suggestions: ['TPEx Emerging API查詢失敗，請手動選擇公司類型']
        };
    }
}

// 生成搜索建議
function generateSuggestions(stockCode) {
    const suggestions = [];
    
    // 根據輸入格式提供建議
    if (/^\d{4}$/.test(stockCode)) {
        suggestions.push(`嘗試搜索股票代碼 ${stockCode}`);
        
        // 上市公司常見代碼範圍
        if (!stockCode.startsWith('6')) {
            suggestions.push('可能是上櫃公司，請手動選擇「上櫃公司」類型');
        }
        
        // 興櫃公司常見代碼範圍
        if (stockCode.startsWith('6')) {
            suggestions.push('可能是興櫃公司，請選擇「興櫃公司」類型');
        }
    } else if (stockCode.length >= 2) {
        suggestions.push(`嘗試搜索公司名稱包含 "${stockCode}"`);
        suggestions.push('請確認股票代碼是否正確');
    }
    
    suggestions.push('建議手動選擇公司類型：上市公司、上櫃公司或興櫃公司');
    suggestions.push('嘗試使用完整的4位數字股票代碼');
    suggestions.push('檢查是否輸入了正確的公司名稱');
    
    return suggestions;
}