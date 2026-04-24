// ai-analysis-display.js
console.log('AI分析顯示模組載入中...');

/**
 * AI分析結果顯示模組
 * 負責解析AI回應並顯示在分頁式界面中
 */
class AIAnalysisDisplay {
    constructor() {
        console.log('AI分析顯示模組初始化');
        this.analysisHistory = {
            news: null,
            risk: null
        };
    }

    /**
     * 顯示AI分析結果
     * @param {Object} result - AI分析結果
     * @param {string} analysisType - 分析類型 (news/risk)
     * @param {string} stockName - 股票名稱
     */
    displayAnalysisResult(result, analysisType, stockName) {
        console.log('顯示AI分析結果:', { 
            analysisType, 
            stockName,
            hasResult: !!result,
            resultKeys: result ? Object.keys(result) : []
        });
        
        try {
            // 解析AI回應
            const parsedContent = this.parseAIResponse(result.content || '', analysisType);
            
            // 更新評分（優先使用解析出來的評分）
            if (parsedContent.score !== undefined) {
                result.score = parsedContent.score;
            }
            
            // 保存分析歷史
            this.saveAnalysisHistory(analysisType, {
                ...result,
                ...parsedContent,
                stockName: stockName,
                timestamp: new Date().toLocaleString('zh-TW')
            });
            
            // 顯示結果區域
            const resultDiv = document.getElementById('aiAnalysisResult');
            if (resultDiv) {
                resultDiv.style.display = 'block';
            } else {
                console.error('找不到 aiAnalysisResult 元素');
                throw new Error('顯示區域不存在');
            }
            
            // 根據分析類型顯示對應的分頁
            if (analysisType === 'news') {
                this.displayNewsAnalysis(parsedContent, stockName);
                // 激活消息面分頁
                this.activateTab('news-analysis-tab');
            } else {
                this.displayRiskAnalysis(parsedContent, stockName);
                // 激活風險面分頁
                this.activateTab('risk-analysis-tab');
            }
            
            console.log('分析結果顯示完成');
            
        } catch (error) {
            console.error('顯示分析結果錯誤:', error);
            this.showError(`顯示失敗: ${error.message}`, stockName);
        }
    }

    /**
     * 激活指定的分頁
     */
    activateTab(tabId) {
        try {
            // 移除所有分頁的 active 類
            document.querySelectorAll('#aiResultTabs .nav-link').forEach(tab => {
                tab.classList.remove('active');
            });
            
            document.querySelectorAll('.tab-pane').forEach(pane => {
                pane.classList.remove('show', 'active');
            });
            
            // 激活指定分頁
            const tabBtn = document.querySelector(`#aiResultTabs .nav-link[href="#${tabId}"]`);
            const tabPane = document.getElementById(tabId);
            
            if (tabBtn && tabPane) {
                tabBtn.classList.add('active');
                tabPane.classList.add('show', 'active');
            }
        } catch (error) {
            console.error('激活分頁錯誤:', error);
        }
    }

    /**
     * 解析AI回應內容
     */
    parseAIResponse(content, analysisType) {
        try {
            console.log('解析AI回應，長度:', content.length);
            
            let score = 0;
            let summary = '';
            let factors = [];
            let isNewsAnalysis = analysisType === 'news';
            
            // 提取評分 - 嘗試多種匹配模式
            const scorePatterns = [
                /評分[：:]\s*([+-]?\d+)/,
                /([+-]?\d+)\s*分/,
                /最終評分[：:]\s*([+-]?\d+)/,
                /消息面評分[：:]\s*([+-]?\d+)/,
                /風險面評分[：:]\s*([+-]?\d+)/
            ];
            
            for (const pattern of scorePatterns) {
                const match = content.match(pattern);
                if (match) {
                    score = parseInt(match[1]);
                    if (!isNaN(score) && score >= -10 && score <= 10) {
                        console.log('提取到評分:', score, '使用模式:', pattern);
                        break;
                    }
                }
            }
            
            // 提取重點總結
            const summaryPatterns = [
                /重點總結[：:]([\s\S]*?)(?=\n\n|$)/,
                /總結[：:]([\s\S]*?)(?=\n\n|$)/,
                /評語[：:]([\s\S]*?)(?=\n\n|$)/
            ];
            
            for (const pattern of summaryPatterns) {
                const match = content.match(pattern);
                if (match) {
                    summary = match[1].trim();
                    if (summary.length > 200) {
                        summary = summary.substring(0, 200) + '...';
                    }
                    break;
                }
            }
            
            // 如果沒有找到總結，使用最後一段作為總結
            if (!summary) {
                const paragraphs = content.split('\n\n').filter(p => p.trim().length > 20);
                if (paragraphs.length > 0) {
                    summary = paragraphs[paragraphs.length - 1].trim();
                    if (summary.length > 200) {
                        summary = summary.substring(0, 200) + '...';
                    }
                }
            }
            
            // 根據分析類型提取因素
            if (isNewsAnalysis) {
                factors = this.extractSectionFactors(content, ['市場消息面', '消息面', '正面因素', '利多因素', '📈 正面因素']);
            } else {
                factors = this.extractSectionFactors(content, ['風險面', '風險因素', '負面因素', '利空因素', '⚠️ 負面因素']);
            }
            
            // 如果沒有提取到因素，嘗試從編號列表中提取
            if (factors.length === 0) {
                factors = this.extractNumberedItems(content).slice(0, 5);
            }
            
            // 如果還是沒有因素，使用默認值
            if (factors.length === 0) {
                factors = isNewsAnalysis ? 
                    ['市場關注度持續提升', '產業發展趨勢向好', '公司基本面穩健', '技術創新保持領先', '政策環境支持有利'] :
                    ['行業競爭日益加劇', '原材料成本壓力上升', '政策法規風險存在', '市場需求可能波動', '技術迭代速度快速'];
            }
            
            console.log('解析完成:', { 
                score, 
                summaryLength: summary.length,
                factorsCount: factors.length
            });
            
            return {
                score: score,
                summary: summary || `${isNewsAnalysis ? '市場消息面' : '風險面'}分析完成，評分: ${score}分`,
                factors: factors,
                rawContent: content
            };
            
        } catch (error) {
            console.error('解析AI回應錯誤:', error);
            return {
                score: 0,
                summary: '分析完成，請查看詳細內容',
                factors: ['詳細分析見完整報告'],
                rawContent: content
            };
        }
    }

    /**
     * 從特定章節提取因素
     */
    extractSectionFactors(content, sectionKeywords) {
        const factors = [];
        
        for (const keyword of sectionKeywords) {
            const regex = new RegExp(`${keyword}[：:]([\\s\\S]*?)(?=\\n\\n[A-Za-z\\u4e00-\\u9fff]{2,}|$)`, 'i');
            const match = content.match(regex);
            
            if (match) {
                console.log(`找到章節 "${keyword}"`);
                const sectionText = match[1];
                const sectionFactors = this.extractNumberedItems(sectionText);
                
                if (sectionFactors.length > 0) {
                    factors.push(...sectionFactors.slice(0, 5));
                    break;
                }
            }
        }
        
        return factors;
    }

    /**
     * 提取編號項目
     */
    extractNumberedItems(text) {
        const items = [];
        const lines = text.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // 匹配多種編號格式: 1., 1、, (1), ① 等
            const numberedMatch = trimmed.match(/^(\d+[\.、]|\(\d+\)|[\u2460-\u2473]|[①②③④⑤⑥⑦⑧⑨⑩])\s+(.+)/);
            if (numberedMatch && numberedMatch[2].trim().length > 3) {
                items.push(numberedMatch[2].trim());
            }
            // 匹配項目符號
            else if (trimmed.match(/^[•\-*]\s+(.+)/)) {
                const item = trimmed.replace(/^[•\-*]\s+/, '').trim();
                if (item.length > 3) {
                    items.push(item);
                }
            }
            // 匹配中文編號
            else if (trimmed.match(/^[一二三四五六七八九十]、\s+(.+)/)) {
                const item = trimmed.replace(/^[一二三四五六七八九十]、\s+/, '').trim();
                if (item.length > 3) {
                    items.push(item);
                }
            }
        }
        
        return items;
    }

    /**
     * 顯示消息面分析
     */
    displayNewsAnalysis(parsedContent, stockName) {
        console.log('顯示消息面分析:', { stockName, parsedContent });
        
        const score = parsedContent.score || 0;
        const factors = parsedContent.factors || [];
        const summary = parsedContent.summary || '';
        
        // 更新評分顯示
        const scoreDisplay = document.getElementById('newsScoreDisplay');
        if (scoreDisplay) {
            scoreDisplay.textContent = score > 0 ? `+${score}` : score.toString();
            scoreDisplay.className = `fs-1 fw-bold ${score > 0 ? 'text-success' : score < 0 ? 'text-danger' : 'text-warning'}`;
            console.log('更新消息面評分顯示:', scoreDisplay.textContent);
        }
        
        // 更新因素列表
        const factorsList = document.getElementById('newsFactorsList');
        if (factorsList) {
            factorsList.innerHTML = factors.map((factor, index) => 
                `<li class="list-group-item">${index + 1}. ${factor}</li>`
            ).join('');
            console.log('更新消息面因素列表，項目數:', factors.length);
        }
        
        // 更新總結
        const summaryEl = document.getElementById('newsSummary');
        if (summaryEl) {
            summaryEl.textContent = summary;
            console.log('更新消息面總結');
        }
        
        // 更新原始內容
        const rawContentEl = document.getElementById('newsRawContent');
        if (rawContentEl) {
            rawContentEl.textContent = parsedContent.rawContent || '';
        }
        
        // 更新應用評分按鈕的數據
        const applyBtn = document.getElementById('applyNewsScore');
        if (applyBtn) {
            applyBtn.dataset.score = score;
            console.log('設置應用評分按鈕數據:', score);
        }
    }

    /**
     * 顯示風險面分析
     */
    displayRiskAnalysis(parsedContent, stockName) {
        console.log('顯示風險面分析:', { stockName, parsedContent });
        
        const score = parsedContent.score || 0;
        const factors = parsedContent.factors || [];
        const summary = parsedContent.summary || '';
        
        // 更新評分顯示
        const scoreDisplay = document.getElementById('riskScoreDisplay');
        if (scoreDisplay) {
            scoreDisplay.textContent = score > 0 ? `+${score}` : score.toString();
            scoreDisplay.className = `fs-1 fw-bold ${score > 0 ? 'text-success' : score < 0 ? 'text-danger' : 'text-warning'}`;
            console.log('更新風險面評分顯示:', scoreDisplay.textContent);
        }
        
        // 更新因素列表
        const factorsList = document.getElementById('riskFactorsList');
        if (factorsList) {
            factorsList.innerHTML = factors.map((factor, index) => 
                `<li class="list-group-item">${index + 1}. ${factor}</li>`
            ).join('');
            console.log('更新風險面因素列表，項目數:', factors.length);
        }
        
        // 更新總結
        const summaryEl = document.getElementById('riskSummary');
        if (summaryEl) {
            summaryEl.textContent = summary;
            console.log('更新風險面總結');
        }
        
        // 更新原始內容
        const rawContentEl = document.getElementById('riskRawContent');
        if (rawContentEl) {
            rawContentEl.textContent = parsedContent.rawContent || '';
        }
        
        // 更新應用評分按鈕的數據
        const applyBtn = document.getElementById('applyRiskScore');
        if (applyBtn) {
            applyBtn.dataset.score = score;
            console.log('設置應用評分按鈕數據:', score);
        }
    }

    /**
     * 顯示錯誤信息
     */
    showError(message, stockName) {
        console.log('顯示錯誤信息:', message);
        
        try {
            // 確保顯示區域可見
            document.getElementById('aiAnalysisResult').style.display = 'block';
            
            // 激活消息面分頁
            this.activateTab('news-analysis-tab');
            
            // 顯示錯誤信息
            const scoreDisplay = document.getElementById('newsScoreDisplay');
            if (scoreDisplay) {
                scoreDisplay.textContent = '0';
                scoreDisplay.className = 'fs-1 fw-bold text-danger';
            }
            
            const summaryEl = document.getElementById('newsSummary');
            if (summaryEl) {
                summaryEl.textContent = `${stockName} 分析失敗: ${message}`;
            }
            
            const factorsList = document.getElementById('newsFactorsList');
            if (factorsList) {
                factorsList.innerHTML = 
                    '<li class="list-group-item">請檢查網絡連接是否正常</li>' +
                    '<li class="list-group-item">確認API Key正確且有效</li>' +
                    '<li class="list-group-item">嘗試使用其他AI平台</li>' +
                    '<li class="list-group-item">如果問題持續，請稍後再試</li>';
            }
            
        } catch (error) {
            console.error('顯示錯誤信息時發生錯誤:', error);
            alert(`分析失敗: ${message}`);
        }
    }

    /**
     * 保存分析歷史
     */
    saveAnalysisHistory(analysisType, data) {
        this.analysisHistory[analysisType] = data;
        console.log(`已保存 ${analysisType} 分析歷史`);
    }

    /**
     * 加載分析歷史
     */
    loadAnalysisHistory(analysisType) {
        return this.analysisHistory[analysisType];
    }

    /**
     * 清除分析結果
     */
    clearAnalysis() {
        console.log('清除分析結果');
        
        this.analysisHistory = { news: null, risk: null };
        
        // 重置所有顯示元素
        const resetElements = [
            'newsScoreDisplay', 'newsFactorsList', 'newsSummary', 'newsRawContent',
            'riskScoreDisplay', 'riskFactorsList', 'riskSummary', 'riskRawContent'
        ];
        
        resetElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (id.includes('ScoreDisplay')) {
                    el.textContent = '0';
                    el.className = 'fs-1 fw-bold text-warning';
                } else if (id.includes('List')) {
                    el.innerHTML = '';
                } else if (id.includes('Summary') || id.includes('RawContent')) {
                    el.textContent = '';
                }
            }
        });
        
        const resultDiv = document.getElementById('aiAnalysisResult');
        if (resultDiv) {
            resultDiv.style.display = 'none';
        }
        
        console.log('分析結果已清除');
    }
}

// 創建全局實例
if (typeof window !== 'undefined') {
    window.aiAnalysisDisplay = new AIAnalysisDisplay();
    console.log('AI分析顯示模組初始化完成');
}