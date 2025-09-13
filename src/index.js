class BaselineAnalyzer {
    constructor() {
        this.features = new Map();
        this.loadFeatureDatabase();
    }

    loadFeatureDatabase() {
        // Real feature detection patterns with accurate browser support data
        const features = [
            {
                id: 'dialog-api',
                pattern: /\.showModal\(\)|<dialog|HTMLDialogElement/i,
                name: 'HTML Dialog API',
                status: 'newly-available',
                baseline: '2022-03-14',
                browsers: { chrome: '37+', firefox: '98+', safari: '15.4+', edge: '79+' },
                polyfill: 'dialog-polyfill',
                fallback: 'Modal div with ARIA attributes',
                mdn: 'https://developer.mozilla.org/docs/Web/HTML/Element/dialog'
            },
            {
                id: 'array-at',
                pattern: /\.at\s*\(\s*-?\d+\s*\)/,
                name: 'Array.prototype.at()',
                status: 'widely-available',
                baseline: '2022-01-15',
                browsers: { chrome: '92+', firefox: '90+', safari: '15.4+', edge: '92+' },
                fallback: 'array[array.length - 1] or array.slice(-1)[0]',
                mdn: 'https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array/at'
            },
            {
                id: 'optional-chaining',
                pattern: /\?\./,
                name: 'Optional Chaining (?.)',
                status: 'widely-available',
                baseline: '2020-04-21',
                browsers: { chrome: '80+', firefox: '72+', safari: '13.1+', edge: '80+' },
                fallback: 'Manual null/undefined checks',
                mdn: 'https://developer.mozilla.org/docs/Web/JavaScript/Reference/Operators/Optional_chaining'
            },
            {
                id: 'nullish-coalescing',
                pattern: /\?\?/,
                name: 'Nullish Coalescing (??)',
                status: 'widely-available',
                baseline: '2020-04-21',
                browsers: { chrome: '80+', firefox: '72+', safari: '13.1+', edge: '80+' },
                fallback: 'value != null ? value : defaultValue',
                mdn: 'https://developer.mozilla.org/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing_operator'
            },
            {
                id: 'temporal-api',
                pattern: /Temporal\./,
                name: 'Temporal API',
                status: 'unsupported',
                baseline: null,
                browsers: { chrome: 'None', firefox: 'None', safari: 'None', edge: 'None' },
                polyfill: '@js-temporal/polyfill',
                mdn: 'https://tc39.es/proposal-temporal/'
            },
            {
                id: 'object-hasown',
                pattern: /Object\.hasOwn\(/,
                name: 'Object.hasOwn()',
                status: 'newly-available',
                baseline: '2022-01-15',
                browsers: { chrome: '93+', firefox: '92+', safari: '15.4+', edge: '93+' },
                fallback: 'Object.prototype.hasOwnProperty.call()',
                mdn: 'https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object/hasOwn'
            },
            {
                id: 'container-queries',
                pattern: /@container|container-type:|container-name:/i,
                name: 'CSS Container Queries',
                status: 'newly-available',
                baseline: '2023-02-14',
                browsers: { chrome: '105+', firefox: '110+', safari: '16.0+', edge: '105+' },
                fallback: 'Media queries with JavaScript',
                mdn: 'https://developer.mozilla.org/docs/Web/CSS/CSS_Container_Queries'
            },
            {
                id: 'css-has',
                pattern: /:has\(/i,
                name: 'CSS :has() Selector',
                status: 'newly-available',
                baseline: '2023-12-18',
                browsers: { chrome: '105+', firefox: '121+', safari: '15.4+', edge: '105+' },
                fallback: 'JavaScript-based selection',
                mdn: 'https://developer.mozilla.org/docs/Web/CSS/:has'
            },
            {
                id: 'css-nesting',
                pattern: /&\s*[:{\.\#]/,
                name: 'CSS Nesting',
                status: 'newly-available',
                baseline: '2023-03-28',
                browsers: { chrome: '112+', firefox: '117+', safari: '16.5+', edge: '112+' },
                fallback: 'Sass/SCSS preprocessing',
                mdn: 'https://developer.mozilla.org/docs/Web/CSS/CSS_Nesting'
            },
            {
                id: 'fetch-api',
                pattern: /fetch\s*\(/,
                name: 'Fetch API',
                status: 'widely-available',
                baseline: '2017-03-01',
                browsers: { chrome: '42+', firefox: '39+', safari: '10.1+', edge: '14+' },
                fallback: 'XMLHttpRequest or axios library',
                mdn: 'https://developer.mozilla.org/docs/Web/API/Fetch_API'
            }
        ];

        features.forEach(feature => {
            this.features.set(feature.id, feature);
        });
    }

    analyzeCode(code, language = 'javascript') {
        const results = [];
        const lines = code.split('\n');

        this.features.forEach((feature, id) => {
            lines.forEach((line, lineIndex) => {
                const match = line.match(feature.pattern);
                if (match) {
                    results.push({
                        id,
                        feature: feature.name,
                        line: lineIndex + 1,
                        column: line.indexOf(match[0]) + 1,
                        code: line.trim(),
                        status: feature.status,
                        baseline: feature.baseline,
                        browsers: feature.browsers,
                        polyfill: feature.polyfill,
                        fallback: feature.fallback,
                        mdn: feature.mdn,
                        severity: this.getSeverity(feature.status),
                        matchedText: match[0]
                    });
                }
            });
        });
        return this.enrichResults(results, code);
    }

    getSeverity(status) {
        const severityMap = {
            'widely-available': 'info',
            'newly-available': 'warning',
            'limited': 'warning',
            'unsupported': 'error'
        };
        return severityMap[status] || 'info';
    }

    enrichResults(results, code) {
        const riskScore = this.calculateRiskScore(results);
        const grouped = this.groupBySeverity(results);
        const suggestions = this.generateSuggestions(results);

        return {
            summary: {
                total: results.length,
                riskScore,
                riskLevel: this.getRiskLevel(riskScore),
                breakdown: grouped,
                compatibilityScore: Math.max(0, 100 - riskScore)
            },
            issues: results,
            suggestions,
            metadata: {
                analyzedAt: new Date().toISOString(),
                linesOfCode: code.split('\n').length,
                charactersCount: code.length
            }
        };
    }

    calculateRiskScore(results) {
        let score = 0;
        results.forEach(result => {
            switch (result.severity) {
                case 'error': score += 15; break;
                case 'warning': score += 5; break;
                case 'info': score += 1; break;
            }
        });
        return Math.min(100, score);
    }

    getRiskLevel(score) {
        if (score >= 40) return 'high';
        if (score >= 15) return 'medium';
        return 'low';
    }

    groupBySeverity(results) {
        return results.reduce((acc, result) => {
            acc[result.severity] = (acc[result.severity] || 0) + 1;
            return acc;
        }, {});
    }

    generateSuggestions(results) {
        const suggestions = [];
        const errorCount = results.filter(r => r.severity === 'error').length;
        const warningCount = results.filter(r => r.severity === 'warning').length;

        if (errorCount > 0) {
            suggestions.push({
                type: 'error',
                message: `${errorCount} unsupported feature${errorCount > 1 ? 's' : ''} may break in older browsers`,
                action: 'Add polyfills or implement fallbacks'
            });
        }

        if (warningCount > 2) {
            suggestions.push({
                type: 'warning',
                message: `${warningCount} newly available features detected`,
                action: 'Verify against your browser support requirements'
            });
        }

        const hasPolyfills = results.filter(r => r.polyfill).length;
        if (hasPolyfills > 0) {
            suggestions.push({
                type: 'fix',
                message: `${hasPolyfills} feature${hasPolyfills > 1 ? 's have' : ' has'} polyfill options available`,
                action: 'Consider adding recommended polyfills'
            });
        }

        return suggestions;
    }
}

class BaselineCopilotApp {
    constructor() {
        this.analyzer = new BaselineAnalyzer();
        this.currentAnalysis = null;
        this.templates = this.initializeTemplates();
        this.initializeApp();
    }

    initializeTemplates() {
        return {
            'modern-js': `// Modern JavaScript Features Demo
const data = { user: { profile: { name: 'John' } } };

// Dialog API
const dialog = document.querySelector('dialog');
if (dialog?.showModal) {
    dialog.showModal();
}

// Array methods
const items = ['apple', 'banana', 'cherry'];
const lastItem = items.at(-1);

// Optional chaining & nullish coalescing
const userName = data?.user?.profile?.name ?? 'Anonymous';

// Object.hasOwn()
if (Object.hasOwn(data, 'user')) {
    console.log('User exists');
}

// Temporal API (experimental)
if (typeof Temporal !== 'undefined') {
    const now = Temporal.Now.instant();
    console.log(now.toString());
}

// Fetch with modern error handling
try {
    const response = await fetch('/api/data');
    const result = await response.json();
} catch (error) {
    console.error('Fetch failed:', error);
}`,
            'css-features': `/* Modern CSS Features Demo */
/* Container Queries */
.card-container {
    container-type: inline-size;
}

@container (min-width: 300px) {
    .card {
        display: flex;
    }
}

/* CSS Nesting */
.navigation {
    background: blue;
    
    & ul {
        list-style: none;
        
        & li {
            padding: 0.5rem;
            
            & a {
                text-decoration: none;
                color: white;
                
                &:hover {
                    color: yellow;
                }
            }
        }
    }
}

/* :has() selector */
.form:has(input:invalid) {
    border: 2px solid red;
}

.card:has(img) {
    display: grid;
    grid-template-columns: 1fr 2fr;
}

/* Logical properties */
.content {
    margin-inline: 1rem;
    padding-block: 2rem;
    border-inline-start: 2px solid blue;
}`,
            'html5-features': `<!DOCTYPE html>
<html>
<head>
    <title>Modern HTML Demo</title>
</head>
<body>
    <dialog id="modal">
        <form method="dialog">
            <p>This is a native HTML dialog!</p>
            <button>Close</button>
        </form>
    </dialog>
    
    <details>
        <summary>Click to expand</summary>
        <p>Hidden content here</p>
    </details>
    
    <form>
        <input type="date" name="birthday">
        <input type="color" name="theme">
        <input type="range" min="0" max="100" name="volume">
        <input type="email" name="email" required>
    </form>
    
    <picture>
        <source media="(min-width: 800px)" srcset="large.jpg">
        <source media="(min-width: 400px)" srcset="medium.jpg">
        <img src="small.jpg" alt="Responsive image">
    </picture>
    
    <script>
        // Use the dialog
        const dialog = document.querySelector('dialog');
        if (dialog?.showModal) {
            // Modern browser
            dialog.showModal();
        }
    </script>
</body>
</html>`
        };
    }

    initializeApp() {
        this.setupEventListeners();
        this.updateStats();
        // Perform initial analysis
        setTimeout(() => this.analyzeCode(), 500);
    }

    setupEventListeners() {
        const analyzeBtn = document.getElementById('analyze-code');
        const codeInput = document.getElementById('code-input');
        const languageSelect = document.getElementById('language-select');
        const clearBtn = document.getElementById('clear-btn');
        const exportBtn = document.getElementById('export-btn');
        const loadSampleBtn = document.getElementById('load-sample');

        analyzeBtn.addEventListener('click', () => this.analyzeCode());
        clearBtn.addEventListener('click', () => this.clearAll());
        exportBtn.addEventListener('click', () => this.exportReport());
        loadSampleBtn.addEventListener('click', () => this.loadSample());

        // Real-time analysis with debouncing
        let timeoutId;
        codeInput.addEventListener('input', () => {
            this.updateStats();
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => this.analyzeCode(), 800);
        });

        // Language change triggers re-analysis
        languageSelect.addEventListener('change', () => {
            this.loadSample();
            setTimeout(() => this.analyzeCode(), 200);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.analyzeCode();
            }
        });
    }

    updateStats() {
        const codeInput = document.getElementById('code-input');
        const code = codeInput.value;
        const lines = code.split('\n').length;
        const chars = code.length;
        
        document.getElementById('line-count').textContent = `${lines} lines`;
        document.getElementById('char-count').textContent = `${chars} characters`;
        
        // Quick feature count
        const quickCount = (code.match(/\?\.|Temporal\.|\.at\(|Object\.hasOwn|@container|:has\(/gi) || []).length;
        document.getElementById('feature-count').textContent = `${quickCount} features detected`;
    }

    async analyzeCode(isRealTime = false) {
        const codeInput = document.getElementById('code-input');
        const languageSelect = document.getElementById('language-select');
        const resultsPanel = document.getElementById('results-panel');
        const statusElement = document.getElementById('analysis-status');

        const code = codeInput.value.trim();
        const language = languageSelect.value;

        if (!code) {
            this.hideResults();
            return;
        }

        // Show analyzing status
        if (!isRealTime) {
            statusElement.textContent = 'Analyzing...';
            this.showLoading();
        }

        try {
            // Simulate processing time for user feedback
            if (!isRealTime) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            const results = this.analyzer.analyzeCode(code, language);
            this.currentAnalysis = results;
            
            this.displayResults(results);
            this.updateSidebar(results);
            resultsPanel.classList.remove('hidden');
            
            statusElement.textContent = isRealTime ? 'Live analysis' : `Found ${results.issues.length} features`;
            
            // Update analysis time
            document.getElementById('analysis-time').textContent = 
                `Analyzed ${results.metadata.linesOfCode} lines • ${new Date().toLocaleTimeString()}`;
        } catch (error) {
            this.showError('Analysis failed: ' + error.message);
            statusElement.textContent = 'Analysis failed';
        }
    }

    updateSidebar(results) {
        const featureCountEl = document.getElementById('sidebar-feature-count');
        const riskLevelEl = document.getElementById('sidebar-risk-level');
        const scoreEl = document.getElementById('sidebar-score');
        const barEl = document.getElementById('compatibility-bar');

        featureCountEl.textContent = results.issues.length;
        riskLevelEl.textContent = results.summary.riskLevel.toUpperCase();
        scoreEl.textContent = `${results.summary.compatibilityScore}/100`;

        // Update risk level color
        const riskColors = {
            'low': 'text-green-600',
            'medium': 'text-yellow-600',
            'high': 'text-red-600'
        };
        riskLevelEl.className = `font-bold ${riskColors[results.summary.riskLevel]}`;

        // Update compatibility bar
        const percentage = results.summary.compatibilityScore;
        const barColor = percentage >= 80 ? 'bg-green-500' : 
                         percentage >= 60 ? 'bg-yellow-500' : 'bg-red-500';
        
        barEl.style.width = `${percentage}%`;
        barEl.className = `h-2 rounded-full transition-all duration-500 ${barColor}`;

        // Update score color
        const scoreColor = percentage >= 80 ? 'text-green-600' : 
                           percentage >= 60 ? 'text-yellow-600' : 'text-red-600';
        scoreEl.className = `font-bold ${scoreColor}`;
    }

    showLoading() {
        const resultsContent = document.getElementById('results-content');
        resultsContent.innerHTML = `
            <div class="flex items-center justify-center py-12">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span class="ml-3 text-gray-600">Analyzing compatibility...</span>
            </div>
        `;
    }

    showError(message) {
        const resultsContent = document.getElementById('results-content');
        resultsContent.innerHTML = `
            <div class="bg-red-50 border border-red-200 rounded-lg p-6">
                <div class="flex items-center">
                    <span class="text-red-500 text-xl mr-3">⚠️</span>
                    <div>
                        <h3 class="font-semibold text-red-800">Analysis Error</h3>
                        <p class="text-red-600">${message}</p>
                    </div>
                </div>
            </div>
        `;
    }

    hideResults() {
        document.getElementById('results-panel').classList.add('hidden');
        this.updateSidebar({ issues: [], summary: { riskLevel: 'low', compatibilityScore: 100 } });
    }

    displayResults(results) {
        const resultsContent = document.getElementById('results-content');
        
        if (results.issues.length === 0) {
            resultsContent.innerHTML = this.renderNoIssues();
            return;
        }

        resultsContent.innerHTML = `
            ${this.renderSummary(results.summary)}
            ${this.renderIssues(results.issues)}
            ${this.renderSuggestions(results.suggestions)}
        `;
    }

    renderNoIssues() {
        return `
            <div class="text-center py-12">
                <div class="text-6xl mb-4">✅</div>
                <h3 class="text-xl font-semibold text-gray-800 mb-2">Perfect Compatibility!</h3>
                <p class="text-gray-600">No modern features detected, or all features are widely supported.</p>
                <p class="text-sm text-gray-500 mt-2">Try adding some modern JavaScript or CSS features to see the analysis in action.</p>
            </div>
        `;
    }

    renderSummary(summary) {
        const riskColors = {
            low: 'bg-green-50 border-green-200 text-green-800',
            medium: 'bg-yellow-50 border-yellow-200 text-yellow-800',
            high: 'bg-red-50 border-red-200 text-red-800'
        };

        return `
            <div class="grid md:grid-cols-3 gap-4 mb-8">
                <div class="border rounded-lg p-4 ${riskColors[summary.riskLevel]}">
                    <div class="text-center">
                        <div class="text-2xl font-bold">${summary.riskLevel.toUpperCase()}</div>
                        <div class="text-sm opacity-75">Risk Level</div>
                    </div>
                </div>
                <div class="border rounded-lg p-4 bg-blue-50 border-blue-200 text-blue-800">
                    <div class="text-center">
                        <div class="text-2xl font-bold">${summary.total}</div>
                        <div class="text-sm opacity-75">Features Found</div>
                    </div>
                </div>
                <div class="border rounded-lg p-4 bg-purple-50 border-purple-200 text-purple-800">
                    <div class="text-center">
                        <div class="text-2xl font-bold">${summary.compatibilityScore}/100</div>
                        <div class="text-sm opacity-75">Compatibility Score</div>
                    </div>
                </div>
            </div>
        `;
    }

    renderIssues(issues) {
        const groupedByFeature = issues.reduce((acc, issue) => {
            if (!acc[issue.feature]) {
                acc[issue.feature] = [];
            }
            acc[issue.feature].push(issue);
            return acc;
        }, {});

        const issueCards = Object.entries(groupedByFeature).map(([featureName, featureIssues]) => {
            const issue = featureIssues[0]; // Use first issue for feature data
            const occurrences = featureIssues.length;

            return `
                <div class="issue-card bg-white border rounded-lg p-6 mb-4 shadow-sm hover:shadow-md transition-shadow">
                    <div class="flex justify-between items-start mb-4">
                        <div>
                            <h3 class="text-lg font-semibold text-gray-800">${featureName}</h3>
                            <p class="text-sm text-gray-600 mt-1">${issue.description || ''}</p>
                            <div class="flex items-center mt-2">
                                <span class="status-badge status-${issue.status}">${issue.status.replace('-', ' ')}</span>
                                ${occurrences > 1 ? `<span class="ml-2 text-sm text-gray-600">${occurrences} occurrences</span>` : ''}
                                ${issue.group ? `<span class="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">${issue.group.toUpperCase()}</span>` : ''}
                            </div>
                        </div>
                        <div class="text-right text-sm text-gray-600">
                            ${issue.baseline ? `Baseline: ${new Date(issue.baseline).toLocaleDateString()}` : 'Not baseline'}
                        </div>
                    </div>

                    <div class="browser-support mb-4">
                        ${Object.entries(issue.browsers).map(([browser, version]) => 
                            `<span class="browser-badge">${browser}: ${version}</span>`
                        ).join('')}
                    </div>

                    ${featureIssues.map(occurrence => `
                        <div class="code-occurrence mb-3 p-3 bg-gray-50 rounded border-l-4 border-blue-400">
                            <div class="text-sm text-gray-600 mb-1">Line ${occurrence.line}, Column ${occurrence.column}</div>
                            <code class="text-sm font-mono text-gray-800">${this.escapeHtml(occurrence.code)}</code>
                        </div>
                    `).join('')}

                    ${this.renderEnhancedFeatureInfo(issue)}

                    <div class="mt-4 space-y-2">
                        ${issue.fallback ? `
                            <div class="text-sm">
                                <span class="font-medium text-gray-700">Fallback:</span>
                                <span class="text-gray-600">${issue.fallback}</span>
                            </div>
                        ` : ''}
                        ${issue.polyfill ? `
                            <div class="text-sm">
                                <span class="font-medium text-gray-700">Polyfill:</span>
                                <span class="text-gray-600">${issue.polyfill}</span>
                            </div>
                        ` : ''}
                        ${issue.performance ? `
                            <div class="text-sm">
                                <span class="font-medium text-gray-700">Performance Impact:</span>
                                <span class="text-gray-600">${issue.performance.impact} (${issue.performance.bundle_size})</span>
                            </div>
                        ` : ''}
                        <div class="flex justify-between items-center">
                            <a href="${issue.mdn}" target="_blank" class="text-blue-600 hover:text-blue-800 underline text-sm">
                                📖 Learn more on MDN
                            </a>
                            ${issue.spec ? `
                                <a href="${issue.spec}" target="_blank" class="text-purple-600 hover:text-purple-800 underline text-sm">
                                    📋 View Specification
                                </a>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="mb-8">
                <h2 class="text-xl font-semibold text-gray-800 mb-4">🔍 Detected Features</h2>
                ${issueCards}
            </div>
        `;
    }

    renderEnhancedFeatureInfo(issue) {
        let infoHtml = '';

        // Usage statistics
        if (issue.usage) {
            const usage = issue.usage.usage_stats;
            const sentiment = issue.usage.developer_sentiment;
            infoHtml += `
                <div class="bg-blue-50 border border-blue-200 rounded p-3 mb-3">
                    <div class="text-sm font-medium text-blue-800 mb-2">📊 Usage Statistics</div>
                    <div class="text-xs text-blue-700 space-y-1">
                        <div>Adoption: ${usage.percentage}% (${usage.trend})</div>
                        <div>Developer Satisfaction: ${sentiment.satisfaction}/5 ⭐</div>
                        <div>Growth: ${usage.monthly_growth > 0 ? '+' : ''}${usage.monthly_growth}% monthly</div>
                    </div>
                </div>
            `;
        }

        // Community feedback
        if (issue.community) {
            const community = issue.community;
            infoHtml += `
                <div class="bg-green-50 border border-green-200 rounded p-3 mb-3">
                    <div class="text-sm font-medium text-green-800 mb-2">🌟 Community Feedback</div>
                    <div class="text-xs text-green-700 space-y-1">
                        <div>Rating: ${community.rating}/5 (${community.votes} votes)</div>
                        <div>Success Stories: ${community.success_stories}</div>
                        ${community.issues_reported > 0 ? `<div>Issues Reported: ${community.issues_reported}</div>` : ''}
                    </div>
                </div>
            `;
        }

        return infoHtml;
    }

    renderSuggestions(suggestions) {
        if (suggestions.length === 0) return '';

        const suggestionCards = suggestions.map(suggestion => {
            const icons = {
                error: '🚨',
                warning: '⚠️',
                fix: '🔧'
            };

            const colors = {
                error: 'bg-red-50 border-red-200 text-red-800',
                warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
                fix: 'bg-blue-50 border-blue-200 text-blue-800'
            };

            return `
                <div class="border rounded-lg p-4 ${colors[suggestion.type]} mb-3">
                    <div class="flex items-start">
                        <span class="text-xl mr-3">${icons[suggestion.type]}</span>
                        <div>
                            <div class="font-medium">${suggestion.message}</div>
                            <div class="text-sm opacity-75 mt-1">${suggestion.action}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div>
                <h2 class="text-xl font-semibold text-gray-800 mb-4">💡 Recommendations</h2>
                ${suggestionCards}
            </div>
        `;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    loadTemplate(templateName) {
        const codeInput = document.getElementById('code-input');
        const languageSelect = document.getElementById('language-select');

        if (this.templates[templateName]) {
            codeInput.value = this.templates[templateName];
            
            // Set appropriate language
            if (templateName.includes('css')) {
                languageSelect.value = 'css';
            } else if (templateName.includes('html')) {
                languageSelect.value = 'html';
            } else {
                languageSelect.value = 'javascript';
            }

            this.updateStats();
            setTimeout(() => this.analyzeCode(), 100);
        }
    }

    loadSample() {
        const languageSelect = document.getElementById('language-select');
        const language = languageSelect.value;
        
        const templateMap = {
            'javascript': 'modern-js',
            'css': 'css-features',
            'html': 'html5-features'
        };

        this.loadTemplate(templateMap[language]);
    }

    clearAll() {
        const codeInput = document.getElementById('code-input');
        codeInput.value = '';
        this.hideResults();
        this.updateStats();
        document.getElementById('analysis-status').textContent = '';
    }

    clearAnalysis() {
        this.hideResults();
        document.getElementById('analysis-status').textContent = '';
    }

    exportReport() {
        if (!this.currentAnalysis) {
            alert('No analysis results to export. Please analyze some code first.');
            return;
        }

        const report = this.generateReport(this.currentAnalysis);
        const blob = new Blob([report], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `baseline-copilot-report-${new Date().toISOString().split('T')[0]}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    generateReport(analysis) {
        const date = new Date().toLocaleDateString();
        const time = new Date().toLocaleTimeString();

        return `# Browser Compatibility Analysis Report

Generated by Baseline Copilot on ${date} at ${time}

## Summary

- **Features Detected**: ${analysis.summary.total}
- **Risk Level**: ${analysis.summary.riskLevel.toUpperCase()}
- **Compatibility Score**: ${analysis.summary.compatibilityScore}/100

## Feature Details

${analysis.issues.map(issue => `
### ${issue.feature}

- **Status**: ${issue.status.replace('-', ' ')}
- **Baseline Date**: ${issue.baseline || 'Not baseline'}
- **Line**: ${issue.line}, Column: ${issue.column}
- **Code**: \`${issue.code}\`

**Browser Support**:
${Object.entries(issue.browsers).map(([browser, version]) => `- ${browser}: ${version}`).join('\n')}

${issue.fallback ? `**Fallback**: ${issue.fallback}` : ''}
${issue.polyfill ? `**Polyfill**: ${issue.polyfill}` : ''}

**Documentation**: [MDN Reference](${issue.mdn})

---
`).join('')}

## Recommendations

${analysis.suggestions.map(suggestion => `
- **${suggestion.type.toUpperCase()}**: ${suggestion.message}
  - Action: ${suggestion.action}
`).join('')}

---
*Report generated by Baseline Copilot - Browser Compatibility Dashboard*
`;
    }
}

// Initialize the application when the page loads
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new BaselineCopilotApp();
});

// Make functions available globally for onclick handlers
window.loadTemplate = (templateName) => app?.loadTemplate(templateName);
window.clearAnalysis = () => app?.clearAnalysis();