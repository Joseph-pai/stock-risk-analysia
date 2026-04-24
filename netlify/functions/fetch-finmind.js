const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    // 從查詢參數中獲取 FinMind 所需的參數
    const { dataset, data_id, start_date, token } = event.queryStringParameters;
    
    // 建構 FinMind API URL
    let url = `https://api.finmindtrade.com/api/v4/data?dataset=${dataset}`;
    if (data_id) url += `&data_id=${data_id}`;
    if (start_date) url += `&start_date=${start_date}`;
    if (token) url += `&token=${token}`;

    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            return {
                statusCode: response.status,
                body: JSON.stringify({ msg: `FinMind API Error: ${response.statusText}` })
            };
        }

        const data = await response.json();

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ msg: error.message })
        };
    }
};