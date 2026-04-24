const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  console.log('=== AI分析函數開始 ===');
  console.log('方法:', event.httpMethod);
  console.log('路徑:', event.path);
  
  // 處理 CORS
  if (event.httpMethod === 'OPTIONS') {
    console.log('處理CORS預檢請求');
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: '只允許POST請求' })
    };
  }

  try {
    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: '無效的JSON格式' })
      };
    }

    const { 
      stockId, 
      stockName, 
      platform, 
      apiKey, 
      analysisType,
      isParallelRequest = false
    } = requestBody;
    
    console.log('請求參數:', { 
      stockId, 
      stockName, 
      platform, 
      analysisType, 
      isParallelRequest,
      apiKeyLength: apiKey ? apiKey.length : 0 
    });

    if (!stockId || !platform || !apiKey) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: '缺少必要參數: stockId, platform, apiKey' })
      };
    }

    let analysisResult;
    
    switch (platform) {
      case 'deepseek':
        analysisResult = await analyzeWithDeepSeek(stockId, stockName, apiKey, analysisType, isParallelRequest);
        break;
      case 'gpt':
        analysisResult = await analyzeWithGPT(stockId, stockName, apiKey, analysisType, isParallelRequest);
        break;
      case 'gemini':
        analysisResult = await analyzeWithGemini(stockId, stockName, apiKey, analysisType, isParallelRequest);
        break;
      case 'claude':
        analysisResult = await analyzeWithClaude(stockId, stockName, apiKey, analysisType, isParallelRequest);
        break;
      case 'grok':
        analysisResult = await analyzeWithGrok(stockId, stockName, apiKey, analysisType, isParallelRequest);
        break;
      default:
        return {
          statusCode: 400,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: '不支持的AI平台: ' + platform })
        };
    }

    console.log(`✅ ${analysisType}分析完成，返回結果`);
    
    // 如果是並行請求，在結果中添加標記
    const responseData = isParallelRequest ? {
      ...analysisResult,
      analysisType: analysisType,
      isParallelResult: true
    } : analysisResult;

    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(responseData)
    };

  } catch (error) {
    console.error('AI分析函數錯誤:', error);
    
    let errorMessage = '分析失敗';
    if (error.message.includes('API Key') || error.message.includes('401') || error.message.includes('403')) {
      errorMessage = 'API Key 無效或已過期';
    } else if (error.message.includes('network') || error.message.includes('fetch') || error.message.includes('ECONNREFUSED')) {
      errorMessage = '網絡連線失敗';
    } else if (error.message.includes('quota') || error.message.includes('limit') || error.message.includes('429')) {
      errorMessage = 'API 配額已用盡';
    } else if (error.message.includes('timeout')) {
      errorMessage = '請求超時';
    }
    
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
        error: errorMessage,
        details: error.message,
        platform: '請檢查Netlify Function日誌'
      })
    };
  }
};

// DeepSeek 分析函數
async function analyzeWithDeepSeek(stockId, stockName, apiKey, analysisType, isParallelRequest = false) {
  const prompt = analysisType === 'news' 
    ? createNewsAnalysisPrompt(stockId, stockName)
    : createRiskAnalysisPrompt(stockId, stockName);

  console.log(`發送${analysisType}請求到DeepSeek API...`);
  console.log('分析類型:', analysisType);
  console.log('並行請求:', isParallelRequest);
  console.log('提示詞長度:', prompt.length);

  const timeoutDuration = isParallelRequest ? 45000 : 55000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log(`${analysisType}分析 DeepSeek API 請求超時`);
    controller.abort();
  }, timeoutDuration);

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1500,
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log(`${analysisType}分析 DeepSeek API 響應狀態:`, response.status);
    
    if (!response.ok) {
      let errorText;
      try {
        const errorData = await response.json();
        errorText = JSON.stringify(errorData);
        console.log('DeepSeek API 錯誤詳情:', errorData);
      } catch (e) {
        errorText = await response.text();
        console.log('DeepSeek API 錯誤文本:', errorText);
      }
      
      if (response.status === 401) {
        throw new Error('DeepSeek API Key 無效或未授權');
      } else if (response.status === 429) {
        throw new Error('DeepSeek API 請求頻率限制');
      } else if (response.status >= 500) {
        throw new Error(`DeepSeek 服務器內部錯誤: ${response.status}`);
      } else {
        throw new Error(`DeepSeek API 錯誤 ${response.status}: ${errorText}`);
      }
    }

    const data = await response.json();
    console.log(`${analysisType}分析 DeepSeek API 響應接收成功`);
    
    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      throw new Error('DeepSeek API 返回數據格式錯誤: 缺少choices');
    }
    
    if (!data.choices[0].message || !data.choices[0].message.content) {
      throw new Error('DeepSeek API 返回數據格式錯誤: 缺少message content');
    }
    
    return parseAIResponse(data.choices[0].message.content, analysisType, stockName);
    
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`${analysisType}分析 DeepSeek API 請求超時 (${timeoutDuration}毫秒)`);
    }
    console.error(`${analysisType}分析 DeepSeek 錯誤:`, error.message);
    throw error;
  }
}

// GPT 分析函數
async function analyzeWithGPT(stockId, stockName, apiKey, analysisType, isParallelRequest = false) {
  const prompt = analysisType === 'news' 
    ? createNewsAnalysisPrompt(stockId, stockName)
    : createRiskAnalysisPrompt(stockId, stockName);

  console.log(`發送${analysisType}請求到 OpenAI API...`);

  const timeoutDuration = isParallelRequest ? 45000 : 55000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1500,
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API錯誤: ${response.status} - ${errorData.error?.message || JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    console.log(`${analysisType}分析 OpenAI API 響應接收成功`);
    return parseAIResponse(data.choices[0].message.content, analysisType, stockName);
    
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`${analysisType}分析 OpenAI API 請求超時`);
    }
    throw error;
  }
}

// Gemini 分析函數
async function analyzeWithGemini(stockId, stockName, apiKey, analysisType, isParallelRequest = false) {
  const prompt = analysisType === 'news' 
    ? createNewsAnalysisPrompt(stockId, stockName)
    : createRiskAnalysisPrompt(stockId, stockName);

  console.log(`發送${analysisType}請求到 Gemini API...`);

  const timeoutDuration = isParallelRequest ? 45000 : 55000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1500
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Gemini API錯誤: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    console.log(`${analysisType}分析 Gemini API 響應接收成功`);
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      throw new Error('Gemini API 返回數據格式錯誤');
    }
    
    const content = data.candidates[0].content.parts[0].text;
    return parseAIResponse(content, analysisType, stockName);
    
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`${analysisType}分析 Gemini API 請求超時`);
    }
    throw error;
  }
}

// Claude 分析函數
async function analyzeWithClaude(stockId, stockName, apiKey, analysisType, isParallelRequest = false) {
  const prompt = analysisType === 'news' 
    ? createNewsAnalysisPrompt(stockId, stockName)
    : createRiskAnalysisPrompt(stockId, stockName);

  console.log(`發送${analysisType}請求到 Claude API...`);

  const timeoutDuration = isParallelRequest ? 45000 : 55000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1500,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: prompt
        }]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Claude API錯誤: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    console.log(`${analysisType}分析 Claude API 響應接收成功`);
    
    if (!data.content || !data.content[0] || !data.content[0].text) {
      throw new Error('Claude API 返回數據格式錯誤');
    }
    
    const content = data.content[0].text;
    return parseAIResponse(content, analysisType, stockName);
    
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`${analysisType}分析 Claude API 請求超時`);
    }
    throw error;
  }
}

// Grok 分析函數
async function analyzeWithGrok(stockId, stockName, apiKey, analysisType, isParallelRequest = false) {
  const prompt = analysisType === 'news' 
    ? createNewsAnalysisPrompt(stockId, stockName)
    : createRiskAnalysisPrompt(stockId, stockName);

  console.log(`發送${analysisType}請求到 Grok API...`);

  const timeoutDuration = isParallelRequest ? 45000 : 55000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'grok-beta',
        messages: [{
          role: 'user',
          content: prompt
        }],
        temperature: 0.7,
        max_tokens: 1500,
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Grok API錯誤: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    console.log(`${analysisType}分析 Grok API 響應接收成功`);
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Grok API 返回數據格式錯誤');
    }
    
    return parseAIResponse(data.choices[0].message.content, analysisType, stockName);
    
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`${analysisType}分析 Grok API 請求超時`);
    }
    throw error;
  }
}

// 修改的提示詞函數 - 消息面分析（確保評分明確）
function createNewsAnalysisPrompt(stockId, stockName) {
  const currentDate = new Date().toLocaleDateString('zh-TW');
  return `作為專業股票分析師，請分析台灣股票 ${stockId} ${stockName} 的最新市場消息面。

**重要要求：**
1. 必須在最後一行明確給出評分格式：最終評分: [+-數字]，數字範圍-10到+10
2. 評分標準：+10分最利好，-10分最利空

請按以下結構提供分析：

【正面因素】
1. [具體利多1]
2. [具體利多2]

【負面因素】
1. [具體利空1]
2. [具體利空2]

【投資建議】
[簡要建議，30字內]

最終評分: [必須是-10到+10的整數，例如：最終評分: +3 或 最終評分: -2]

請基於最新市場資訊提供客觀分析。`;
}

// 修改的提示詞函數 - 風險面分析（確保評分明確）
function createRiskAnalysisPrompt(stockId, stockName) {
  const currentDate = new Date().toLocaleDateString('zh-TW');
  return `作為風險分析師，請分析台灣股票 ${stockId} ${stockName} 的風險面因素。

**重要要求：**
1. 必須在最後一行明確給出評分格式：最終評分: [+-數字]，數字範圍-10到+10
2. 評分標準：+10分風險最低，-10分風險最高

請按以下結構提供分析：

【主要風險】
1. [主要風險1]
2. [主要風險2]

【風險緩衝】
1. [公司優勢1]
2. [公司優勢2]

【風險建議】
[簡要建議，30字內]

最終評分: [必須是-10到+10的整數，例如：最終評分: +3 或 最終評分: -2]

請提供客觀的風險評估。`;
}

// 增強版的解析AI回應函數
function parseAIResponse(content, analysisType, stockName = '') {
  try {
    console.log(`解析${analysisType} AI回應，內容長度:`, content.length);
    console.log(`內容前200字:`, content.substring(0, 200));
    
    // 先嘗試提取評分 - 使用更強的匹配模式
    let score = extractScoreFromContent(content, analysisType);
    console.log(`提取的${analysisType}評分:`, score);
    
    // 嘗試結構化解析
    let structuredResult = parseStructuredResponse(content, analysisType, stockName);
    
    // 確保結果中包含正確的評分
    if (structuredResult.structured) {
      // 如果結構化結果中有不同的評分，使用提取的評分
      if (score !== 0 && structuredResult.score === 0) {
        structuredResult.score = score;
        console.log(`使用提取的評分替換結構化評分:`, score);
      }
      console.log(`✅ 成功解析${analysisType}結構化回應，評分:`, structuredResult.score);
      return structuredResult;
    }
    
    // 如果結構化解析失敗，使用簡單解析
    console.log(`⚠️ ${analysisType}結構化解析失敗，使用簡單解析`);
    
    let comment = '分析完成';
    const commentMatch = content.match(/【(投資建議|風險建議|建議)】\s*(.+?)(?=\n|$)/i) ||
                        content.match(/建議[：:]\s*(.+?)(?=\n|$)/i) ||
                        content.match(/投資建議[：:]\s*(.+?)(?=\n|$)/i) ||
                        content.match(/總結[：:]\s*(.+?)(?=\n|$)/i);
    
    if (commentMatch) {
      comment = commentMatch[2]?.trim() || commentMatch[1]?.trim();
      if (comment.length > 100) {
        comment = comment.substring(0, 100) + '...';
      }
    }

    return {
      success: true,
      content: content,
      score: score,
      comment: comment,
      analysisType: analysisType,
      structured: false
    };
    
  } catch (error) {
    console.error(`解析${analysisType} AI回應錯誤:`, error);
    return {
      success: true,
      content: content,
      score: 0,
      comment: '內容解析完成，請手動查看詳細分析',
      analysisType: analysisType,
      structured: false
    };
  }
}

// 新增：更強的評分提取函數
function extractScoreFromContent(content, analysisType) {
  console.log(`從${analysisType}內容提取評分...`);
  
  let score = 0;
  
  // 多種評分匹配模式，按優先級排序
  const scorePatterns = [
    // 匹配 "最終評分: +3" 格式
    /最終評分[：:]\s*([+-]?\d+)/i,
    // 匹配 "【最終評分】+3" 格式
    /【最終評分】\s*[：:]*\s*([+-]?\d+)/i,
    // 匹配 "評分: +3" 格式
    /評分[：:]\s*([+-]?\d+)/i,
    // 匹配 "+3/10" 格式
    /([+-]?\d+)\s*\/\s*10/i,
    // 匹配消息面/風險面評分
    /消息面評分[：:]\s*([+-]?\d+)/i,
    /風險面評分[：:]\s*([+-]?\d+)/i,
    // 匹配 "-3分" 格式
    /([+-]?\d+)\s*分/i,
    // 匹配括號中的評分
    /[（(]\s*([+-]?\d+)\s*[）)]/,
    // 匹配 "分數: +3" 格式
    /分數[：:]\s*([+-]?\d+)/i
  ];
  
  for (const pattern of scorePatterns) {
    const match = content.match(pattern);
    if (match) {
      const extractedScore = parseInt(match[1]);
      console.log(`嘗試模式 ${pattern}:`, match[0], '=>', extractedScore);
      
      if (!isNaN(extractedScore) && extractedScore >= -10 && extractedScore <= 10) {
        score = extractedScore;
        console.log(`✅ 成功提取評分:`, score, '使用模式:', pattern);
        break;
      }
    }
  }
  
  // 如果還是0，嘗試搜尋常見的評分位置
  if (score === 0) {
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // 檢查是否包含評分相關關鍵字
      if (trimmedLine.includes('評分') || trimmedLine.includes('/10') || 
          trimmedLine.includes('分') && trimmedLine.length < 30) {
        
        // 嘗試從這一行提取數字
        const numberMatches = trimmedLine.match(/[+-]?\d+/g);
        if (numberMatches) {
          for (const numStr of numberMatches) {
            const num = parseInt(numStr);
            if (!isNaN(num) && num >= -10 && num <= 10) {
              score = num;
              console.log(`✅ 從行 "${trimmedLine}" 提取評分:`, score);
              break;
            }
          }
          if (score !== 0) break;
        }
      }
    }
  }
  
  // 最終檢查：確保評分在範圍內
  if (score < -10) score = -10;
  if (score > 10) score = 10;
  
  console.log(`最終提取的${analysisType}評分:`, score);
  return score;
}

// 修改的結構化解析函數
function parseStructuredResponse(content, analysisType, stockName = '') {
  try {
    console.log(`開始解析${analysisType}結構化回應...`);
    
    // 首先提取評分
    let score = extractScoreFromContent(content, analysisType);
    
    let positives = [];
    let negatives = [];
    let scoreDetails = [];
    let recommendation = '';

    if (analysisType === 'news') {
      // 提取正面因素 - 更寬鬆的匹配
      const positivesSection = content.match(/【正面因素】([\s\S]*?)(?=【負面因素】|【評分項目】|【最終評分】|$)/i);
      if (positivesSection) {
        positives = extractItemsFromText(positivesSection[1]);
        console.log(`提取${analysisType}正面因素:`, positives.length);
      }
      
      // 如果沒有找到，嘗試其他格式
      if (positives.length === 0) {
        const altPositives = content.match(/正面因素[：:]([\s\S]*?)(?=\n\n|$)/i);
        if (altPositives) {
          positives = extractItemsFromText(altPositives[1]);
        }
      }

      // 提取負面因素
      const negativesSection = content.match(/【負面因素】([\s\S]*?)(?=【評分項目】|【最終評分】|$)/i);
      if (negativesSection) {
        negatives = extractItemsFromText(negativesSection[1]);
        console.log(`提取${analysisType}負面因素:`, negatives.length);
      }
      
      // 如果沒有找到，嘗試其他格式
      if (negatives.length === 0) {
        const altNegatives = content.match(/負面因素[：:]([\s\S]*?)(?=\n\n|$)/i);
        if (altNegatives) {
          negatives = extractItemsFromText(altNegatives[1]);
        }
      }
    } else {
      // 風險分析 - 更寬鬆的匹配
      const risksSection = content.match(/【主要風險】([\s\S]*?)(?=【風險緩衝】|【評分項目】|【最終評分】|$)/i);
      if (risksSection) {
        negatives = extractItemsFromText(risksSection[1]);
        console.log(`提取${analysisType}風險因素:`, negatives.length);
      }
      
      const buffersSection = content.match(/【風險緩衝】([\s\S]*?)(?=【評分項目】|【最終評分】|$)/i);
      if (buffersSection) {
        positives = extractItemsFromText(buffersSection[1]);
        console.log(`提取${analysisType}緩衝因素:`, positives.length);
      }
    }

    // 提取建議
    const recommendationMatch = content.match(/【(投資建議|風險建議|建議)】([\s\S]*?)(?=【|$)/i);
    if (recommendationMatch) {
      recommendation = recommendationMatch[2].trim();
    }
    
    // 如果沒有找到，嘗試其他格式
    if (!recommendation) {
      const altRecommendation = content.match(/(建議|投資建議|風險建議)[：:]([\s\S]*?)(?=\n\n|$)/i);
      if (altRecommendation) {
        recommendation = altRecommendation[2]?.trim() || altRecommendation[1]?.trim();
      }
    }

    // 格式化顯示內容
    const formattedContent = formatAnalysisContent(
      positives, 
      negatives, 
      scoreDetails,
      '', 
      recommendation, 
      score,
      analysisType,
      stockName
    );

    return {
      success: true,
      content: formattedContent,
      rawContent: content,
      score: score,
      comment: recommendation || '分析完成',
      analysisType: analysisType,
      structured: true,
      positives: positives,
      negatives: negatives,
      scoreDetails: scoreDetails
    };

  } catch (error) {
    console.error(`解析${analysisType}結構化回應錯誤:`, error);
    // 回退到簡單解析
    return parseFallbackResponse(content, analysisType, stockName, 0);
  }
}

// 新增：從文本中提取項目的通用函數
function extractItemsFromText(text) {
  if (!text) return [];
  
  const items = [];
  const lines = text.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    
    // 匹配多種格式
    const numberedMatch = trimmed.match(/^(\d+[\.、)]|[\u2460-\u2473]|[①②③④⑤⑥⑦⑧⑨⑩])\s+(.+)/);
    if (numberedMatch) {
      items.push(numberedMatch[2].trim());
      continue;
    }
    
    // 匹配項目符號
    const bulletMatch = trimmed.match(/^[•\-*]\s+(.+)/);
    if (bulletMatch) {
      items.push(bulletMatch[1].trim());
      continue;
    }
    
    // 如果是短句，直接添加
    if (trimmed.length > 3 && trimmed.length < 100 && !trimmed.includes('：') && !trimmed.includes(':')) {
      items.push(trimmed);
    }
  }
  
  return items.slice(0, 5); // 最多返回5個項目
}

// 備用解析方法
function parseFallbackResponse(content, analysisType, stockName, score) {
  const lines = content.split('\n').filter(line => line.trim().length > 0);
  let positives = [];
  let negatives = [];
  let recommendation = '';
  
  if (analysisType === 'news') {
    // 消息面：簡單的關鍵詞匹配
    lines.forEach(line => {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('正面') || lowerLine.includes('利好') || lowerLine.includes('優勢') || 
          lowerLine.includes('機會') || lowerLine.includes('成長')) {
        if (line.length > 8 && !line.match(/^(正面|利好|優勢|機會|成長)/)) {
          positives.push(line);
        }
      } else if (lowerLine.includes('負面') || lowerLine.includes('風險') || lowerLine.includes('挑戰') || 
                lowerLine.includes('問題') || lowerLine.includes('不利')) {
        if (line.length > 8 && !line.match(/^(負面|風險|挑戰|問題|不利)/)) {
          negatives.push(line);
        }
      } else if (lowerLine.includes('建議') || lowerLine.includes('推薦') || lowerLine.includes('結論')) {
        recommendation = line;
      }
    });
    
    // 如果沒有找到足夠的因素，使用默認值
    if (positives.length === 0) {
      positives = ['營收表現穩健', '市場地位穩固'];
    }
    if (negatives.length === 0) {
      negatives = ['行業競爭加劇', '成本壓力上升'];
    }
  } else {
    // 風險面：不同的關鍵詞匹配
    lines.forEach(line => {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('風險') || lowerLine.includes('問題') || lowerLine.includes('挑戰') || 
          lowerLine.includes('威脅') || lowerLine.includes('不利') || lowerLine.includes('下跌')) {
        if (line.length > 8) {
          negatives.push(line);
        }
      } else if (lowerLine.includes('優勢') || lowerLine.includes('緩衝') || lowerLine.includes('保護') || 
                lowerLine.includes('防禦') || lowerLine.includes('競爭力') || lowerLine.includes('穩健')) {
        if (line.length > 8) {
          positives.push(line);
        }
      } else if (lowerLine.includes('建議') || lowerLine.includes('推薦') || lowerLine.includes('策略')) {
        recommendation = line;
      }
    });
    
    // 如果沒有找到足夠的因素，使用默認值
    if (negatives.length === 0) {
      negatives = ['財務槓桿過高', '行業競爭激烈'];
    }
    if (positives.length === 0) {
      positives = ['現金流充足', '技術領先地位'];
    }
  }
  
  const scoreDetails = generateScoreDetails(positives, negatives, score, analysisType);
  const formattedContent = formatAnalysisContent(
    positives, negatives, scoreDetails, '', recommendation, score, analysisType, stockName
  );
  
  return {
    success: true,
    content: formattedContent,
    rawContent: content,
    score: score,
    comment: recommendation || '基於綜合分析給出的建議',
    analysisType: analysisType,
    structured: false,
    positives: positives.slice(0, 2),
    negatives: negatives.slice(0, 2),
    scoreDetails: scoreDetails
  };
}

// 生成評分詳情
function generateScoreDetails(positives, negatives, totalScore, analysisType) {
  const details = [];
  
  if (analysisType === 'news') {
    // 消息面評分分配
    const positiveScores = [2, 1];
    const negativeScores = [-1, -1];
    
    positives.forEach((positive, index) => {
      if (index < 2) {
        details.push({
          item: `正面因素 ${index + 1}`,
          score: positiveScores[index] || 1,
          reason: positive
        });
      }
    });
    
    negatives.forEach((negative, index) => {
      if (index < 2) {
        details.push({
          item: `負面因素 ${index + 1}`,
          score: negativeScores[index] || -1,
          reason: negative
        });
      }
    });
  } else {
    // 風險面評分分配
    const riskScores = [-2, -1];
    const bufferScores = [2, 1];
    
    negatives.forEach((risk, index) => {
      if (index < 2) {
        details.push({
          item: `風險因素 ${index + 1}`,
          score: riskScores[index] || -1,
          reason: risk
        });
      }
    });
    
    positives.forEach((buffer, index) => {
      if (index < 2) {
        details.push({
          item: `風險緩衝 ${index + 1}`,
          score: bufferScores[index] || 1,
          reason: buffer
        });
      }
    });
  }
  
  return details;
}

// 格式化分析內容
function formatAnalysisContent(positives, negatives, scoreDetails, summary, recommendation, score, analysisType, stockName) {
  const now = new Date();
  const analysisTime = now.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  let formatted = '';
  
  if (analysisType === 'news') {
    // 消息面評分顏色，+分為紅色，-分為黑色
    const scoreColor = score > 0 ? '🔴' : '⚫';
    const scoreText = score > 0 ? `+${score}` : score;
    formatted += `📊 ${scoreColor} ${stockName} 消息面分析評分: ${scoreText}/10\n\n`;
    
    formatted += `🌟 正面因素 (利多):\n`;
    positives.forEach((item, index) => {
      formatted += `${index + 1}. ${item}\n`;
    });
    
    formatted += `\n⚠️ 負面因素 (風險):\n`;
    negatives.forEach((item, index) => {
      formatted += `${index + 1}. ${item}\n`;
    });
    
  } else {
    // 風險面保持原有顏色邏輯
    const scoreColor = score > 0 ? '🟢' : score < 0 ? '🔴' : '🟡';
    const scoreText = score > 0 ? `+${score}` : score;
    formatted += `📊 ${scoreColor} ${stockName} 風險面分析評分: ${scoreText}/10\n\n`;
    
    formatted += `🔴 風險因素:\n`;
    negatives.forEach((item, index) => {
      formatted += `${index + 1}. ${item}\n`;
    });
    
    formatted += `\n🛡️ 風險緩衝因素:\n`;
    positives.forEach((item, index) => {
      formatted += `${index + 1}. ${item}\n`;
    });
  }
  
  // 添加評分項目詳情
  if (scoreDetails.length > 0) {
    formatted += `\n📈 評分項目詳情:\n`;
    scoreDetails.forEach(item => {
      formatted += `• ${item.item}: ${item.score > 0 ? '+' : ''}${item.score}分 - ${item.reason}\n`;
    });
  }
  
  if (recommendation) {
    formatted += `\n💡 建議:\n${recommendation}\n`;
  }
  
  formatted += `\n---\n*分析時間: ${analysisTime}*`;
  
  return formatted;
}