const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  console.log('=== 簡單API測試開始 ===');
  
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: ''
    };
  }

  try {
    const { apiKey, platform = 'deepseek' } = JSON.parse(event.body || '{}');
    
    console.log(`測試平台: ${platform}, API Key 長度: ${apiKey ? apiKey.length : 0}`);

    if (!apiKey) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: '缺少 API Key' })
      };
    }

    let testResult;
    
    switch (platform) {
      case 'deepseek':
        testResult = await testDeepSeek(apiKey);
        break;
      case 'gpt':
        testResult = await testGPT(apiKey);
        break;
      case 'gemini':
        testResult = await testGemini(apiKey);
        break;
      case 'claude':
        testResult = await testClaude(apiKey);
        break;
      case 'grok':
        testResult = await testGrok(apiKey);
        break;
      default:
        return {
          statusCode: 400,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: '不支持的平台: ' + platform })
        };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(testResult)
    };

  } catch (error) {
    console.error('API測試錯誤:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
        error: error.message
      })
    };
  }
};

// DeepSeek 測試
async function testDeepSeek(apiKey) {
  const response = await fetch('https://api.deepseek.com/v1/models', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    }
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`DeepSeek API錯誤: ${response.status} - ${JSON.stringify(errorData)}`);
  }

  return {
    success: true,
    message: 'DeepSeek API 連線正常，模型列表獲取成功'
  };
}

// GPT 測試
async function testGPT(apiKey) {
  const response = await fetch('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    }
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`OpenAI API錯誤: ${response.status} - ${JSON.stringify(errorData)}`);
  }

  return {
    success: true,
    message: 'OpenAI API 連線正常，模型列表獲取成功'
  };
}

// Gemini 測試
async function testGemini(apiKey) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`, {
    method: 'GET'
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Gemini API錯誤: ${response.status} - ${JSON.stringify(errorData)}`);
  }

  return {
    success: true,
    message: 'Gemini API 連線正常，模型列表獲取成功'
  };
}

// Claude 測試
async function testClaude(apiKey) {
  const response = await fetch('https://api.anthropic.com/v1/models', {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    }
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Claude API錯誤: ${response.status} - ${JSON.stringify(errorData)}`);
  }

  return {
    success: true,
    message: 'Claude API 連線正常，模型列表獲取成功'
  };
}

// Grok 測試
async function testGrok(apiKey) {
  const response = await fetch('https://api.x.ai/v1/models', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    }
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Grok API錯誤: ${response.status} - ${JSON.stringify(errorData)}`);
  }

  return {
    success: true,
    message: 'Grok API 連線正常，模型列表獲取成功'
  };
}