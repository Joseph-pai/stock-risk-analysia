const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    const stockId = event.queryStringParameters?.stock_id;
    // 優先讀取環境變數中的 Token，其次才是網址參數
    const token = process.env.FINMIND_TOKEN || process.env.TOKEN || event.queryStringParameters?.token || '';
    const dataType = event.queryStringParameters?.data_type || 'margin'; // margin | institutional

    if (!stockId) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, error: '缺少股票代碼' })
        };
    }

    console.log(`fetch-chips: stock=${stockId}, type=${dataType}, token=${token ? '有' : '無'}`);

    try {
        let result;
        if (dataType === 'margin') {
            result = await fetchMarginData(stockId, token);
        } else if (dataType === 'institutional') {
            result = await fetchInstitutionalData(stockId, token);
        } else {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, error: '不支援的資料類型' })
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(result)
        };
    } catch (error) {
        console.error('fetch-chips 錯誤:', error);
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: false, error: '資料無法取得', details: error.message })
        };
    }
};

// ── 工具：取得最近工作日（格式 YYYYMMDD）─────────────────────────
function getRecentWorkday() {
    const d = new Date();
    // 收盤前（台股09:00前）視為前一天
    if (d.getHours() < 9) d.setDate(d.getDate() - 1);
    while (d.getDay() === 0 || d.getDay() === 6) {
        d.setDate(d.getDate() - 1);
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${dd}`;
}

// ── 融資餘額 ──────────────────────────────────────────────────────
async function fetchMarginData(stockId, token) {

    // 1️⃣ FinMind（需要 token）
    if (token) {
        try {
            const start = new Date();
            start.setDate(start.getDate() - 30);
            const startStr = start.toISOString().split('T')[0];

            const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockMarginPurchaseShortSale&data_id=${stockId}&start_date=${startStr}`;
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` }, timeout: 10000 });

            if (res.ok) {
                const json = await res.json();
                if (json.status === 200 && json.data && json.data.length > 0) {
                    const sorted = json.data.sort((a, b) => b.date.localeCompare(a.date));
                    const latest = sorted[0];
                    const prev   = sorted[1] || null;

                    const balance = parseInt(latest.MarginPurchaseTodayBalance) || 0;
                    const prevBal = prev ? (parseInt(prev.MarginPurchaseTodayBalance) || 0) : balance;
                    const change  = balance - prevBal;

                    // 趨勢：取最近 5 筆
                    let trend = 'stable';
                    if (sorted.length >= 3) {
                        const vals = sorted.slice(0, 5).map(d => parseInt(d.MarginPurchaseTodayBalance) || 0);
                        const up   = vals.every((v, i) => i === 0 || v >= vals[i - 1]);
                        const down = vals.every((v, i) => i === 0 || v <= vals[i - 1]);
                        if (up)   trend = 'increasing';
                        if (down) trend = 'decreasing';
                    }

                    return {
                        success: true,
                        source: 'FinMind',
                        data: { margin_balance: balance, margin_change: change, margin_trend: trend, date: latest.date }
                    };
                }
            }
        } catch (e) {
            console.log('FinMind margin 失敗:', e.message);
        }
    }

    // 2️⃣ TWSE 備援
    try {
        const dateStr = getRecentWorkday();
        const url = `https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=${dateStr}&stockNo=${stockId}&response=json`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
        });

        if (res.ok) {
            const json = await res.json();
            if (json.stat === 'OK' && json.data && json.data.length > 0) {
                // 欄位順序: [0]日期 [4]融資餘額
                const rows = json.data;
                const parse = (row) => parseInt(String(row[4]).replace(/,/g, '')) || 0;
                const balance = parse(rows[rows.length - 1]);
                const prevBal = rows.length > 1 ? parse(rows[rows.length - 2]) : balance;
                const change  = balance - prevBal;

                return {
                    success: true,
                    source: 'TWSE',
                    data: {
                        margin_balance: balance,
                        margin_change: change,
                        margin_trend: change > 0 ? 'increasing' : change < 0 ? 'decreasing' : 'stable',
                        date: dateStr
                    }
                };
            }
        }
    } catch (e) {
        console.log('TWSE margin 失敗:', e.message);
    }

    return { success: false, source: 'none', error: '資料無法取得' };
}

// ── 三大法人 ──────────────────────────────────────────────────────
async function fetchInstitutionalData(stockId, token) {

    // 1️⃣ FinMind（需要 token）
    if (token) {
        try {
            const start = new Date();
            start.setDate(start.getDate() - 20);
            const startStr = start.toISOString().split('T')[0];

            const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInstitutionalInvestorsBuySell&data_id=${stockId}&start_date=${startStr}`;
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` }, timeout: 10000 });

            if (res.ok) {
                const json = await res.json();
                if (json.status === 200 && json.data && json.data.length > 0) {
                    const sorted     = json.data.sort((a, b) => b.date.localeCompare(a.date));
                    const latestDate = sorted[0].date;
                    const latestRows = sorted.filter(d => d.date === latestDate);

                    let foreignNet = 0, trustNet = 0, dealerNet = 0;
                    latestRows.forEach(row => {
                        const net = (parseInt(row.buy) || 0) - (parseInt(row.sell) || 0);
                        const n   = (row.name || '').toLowerCase();
                        if (n.includes('foreign') || n.includes('外資')) foreignNet += net;
                        else if (n.includes('trust') || n.includes('投信'))   trustNet   += net;
                        else if (n.includes('dealer') || n.includes('自營'))  dealerNet  += net;
                    });

                    // 計算連續買賣天數
                    const calcConsecutive = (keyword) => {
                        const byDate = {};
                        sorted.forEach(d => {
                            const n = (d.name || '').toLowerCase();
                            if (!n.includes(keyword)) return;
                            if (!byDate[d.date]) byDate[d.date] = 0;
                            byDate[d.date] += (parseInt(d.buy) || 0) - (parseInt(d.sell) || 0);
                        });
                        const dates = Object.keys(byDate).sort().reverse();
                        if (dates.length === 0) return 0;
                        const firstNet = byDate[dates[0]];
                        if (firstNet === 0) return 0; // 0張則中斷連續
                        const firstDir = firstNet > 0 ? 1 : -1;
                        let count = 0;
                        for (const dt of dates) {
                            const net = byDate[dt];
                            const dir = net > 0 ? 1 : (net < 0 ? -1 : 0);
                            if (dir === firstDir) count += firstDir;
                            else break;
                        }
                        return count;
                    };

                    return {
                        success: true,
                        source: 'FinMind',
                        data: {
                            foreign_net: foreignNet,
                            foreign_consecutive: calcConsecutive('foreign'),
                            trust_net: trustNet,
                            trust_consecutive: calcConsecutive('trust'),
                            dealer_net: dealerNet,
                            date: latestDate
                        }
                    };
                }
            }
        } catch (e) {
            console.log('FinMind institutional 失敗:', e.message);
        }
    }

    // 2️⃣ TWSE 備援
    try {
        const dateStr = getRecentWorkday();
        const url = `https://www.twse.com.tw/rwd/zh/fund/TWT38U?date=${dateStr}&stockNo=${stockId}&response=json`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
        });

        if (res.ok) {
            const json = await res.json();
            if (json.stat === 'OK' && json.data && json.data.length > 0) {
                let foreignNet = 0, trustNet = 0, dealerNet = 0;
                json.data.forEach(row => {
                    // 欄位: [0]名稱 [1]買 [2]賣 [3]買賣差  (數值含逗號，可能含−全形負號)
                    const parseNum = (s) => parseInt(String(s || '0').replace(/,/g, '').replace(/[−‐]/g, '-')) || 0;
                    const name = String(row[0] || '');
                    const net  = parseNum(row[3]);
                    if (name.includes('外資'))       foreignNet += net;
                    else if (name.includes('投信'))  trustNet   += net;
                    else if (name.includes('自營'))  dealerNet  += net;
                });

                return {
                    success: true,
                    source: 'TWSE',
                    data: {
                        foreign_net: foreignNet,
                        foreign_consecutive: null, // 單日無法計算
                        trust_net: trustNet,
                        trust_consecutive: null,
                        dealer_net: dealerNet,
                        date: dateStr
                    }
                };
            }
        }
    } catch (e) {
        console.log('TWSE institutional 失敗:', e.message);
    }

    return { success: false, source: 'none', error: '資料無法取得' };
}
