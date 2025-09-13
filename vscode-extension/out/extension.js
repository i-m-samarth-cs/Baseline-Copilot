"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const analyzer_1 = require("./analyzer");
function activate(context) {
    console.log('Baseline Copilot extension is now active!');
    const analyzer = new analyzer_1.EnhancedBaselineAnalyzer();
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('baseline-copilot');
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    // Set context for conditional UI elements
    vscode.commands.executeCommand('setContext', 'baselineCopilot.activated', true);
    // Initialize status bar
    statusBarItem.text = "$(target) Baseline: Ready";
    statusBarItem.tooltip = "Baseline Copilot - Browser Compatibility Analysis";
    statusBarItem.command = 'baselineCopilot.showPanel';
    statusBarItem.show();
    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand('baselineCopilot.analyzeFile', () => analyzeCurrentFile()), vscode.commands.registerCommand('baselineCopilot.analyzeWorkspace', () => analyzeWorkspace()), vscode.commands.registerCommand('baselineCopilot.generateReport', () => generateReport()), vscode.commands.registerCommand('baselineCopilot.showPanel', () => showCompatibilityPanel()));
    // Register providers
    context.subscriptions.push(vscode.languages.registerHoverProvider(['javascript', 'typescript', 'css', 'html', 'jsx', 'tsx'], new BaselineHoverProvider(analyzer)), vscode.languages.registerCodeActionsProvider(['javascript', 'typescript', 'css', 'html', 'jsx', 'tsx'], new BaselineCodeActionProvider(), { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }));
    // Set up real-time analysis
    if (vscode.workspace.getConfiguration('baselineCopilot').get('enableRealTimeAnalysis')) {
        let timeout;
        context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                analyzeDocument(event.document);
            }, 500);
        }));
        context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                analyzeDocument(editor.document);
            }
        }));
    }
    // Analyze current file on activation
    if (vscode.window.activeTextEditor) {
        analyzeDocument(vscode.window.activeTextEditor.document);
    }
    async function analyzeCurrentFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor found');
            return;
        }
        await analyzeDocument(editor.document);
        vscode.window.showInformationMessage('Baseline compatibility analysis completed');
    }
    async function analyzeDocument(document) {
        // Only analyze supported file types
        const supportedLanguages = ['javascript', 'typescript', 'css', 'html', 'jsx', 'tsx'];
        if (!supportedLanguages.includes(document.languageId)) {
            return;
        }
        statusBarItem.text = "$(sync~spin) Baseline: Analyzing...";
        try {
            const code = document.getText();
            const analysis = await analyzer.analyzeCode(code, document.languageId);
            const diagnostics = [];
            analysis.issues.forEach(issue => {
                const range = new vscode.Range(issue.line - 1, issue.column - 1, issue.line - 1, issue.column - 1 + issue.matchedText.length);
                const diagnostic = new vscode.Diagnostic(range, `${issue.feature}: ${issue.status.replace('-', ' ')}`, getSeverity(issue.severity));
                diagnostic.code = issue.id;
                diagnostic.source = 'baseline-copilot';
                diagnostic.relatedInformation = [
                    new vscode.DiagnosticRelatedInformation(new vscode.Location(document.uri, range), `Browser support: ${Object.entries(issue.browsers).map(([browser, version]) => `${browser} ${version}`).join(', ')}`)
                ];
                diagnostics.push(diagnostic);
            });
            diagnosticCollection.set(document.uri, diagnostics);
            // Update status bar
            const issueCount = analysis.issues.length;
            const riskLevel = analysis.summary.riskLevel;
            const icon = getRiskIcon(riskLevel);
            statusBarItem.text = `${icon} Baseline: ${issueCount} features (${riskLevel} risk)`;
        }
        catch (error) {
            console.error('Analysis failed:', error);
            statusBarItem.text = "$(error) Baseline: Analysis failed";
        }
    }
    function getSeverity(severity) {
        switch (severity) {
            case 'error': return vscode.DiagnosticSeverity.Error;
            case 'warning': return vscode.DiagnosticSeverity.Warning;
            case 'info': return vscode.DiagnosticSeverity.Information;
            default: return vscode.DiagnosticSeverity.Hint;
        }
    }
    function getRiskIcon(riskLevel) {
        switch (riskLevel) {
            case 'high': return '$(error)';
            case 'medium': return '$(warning)';
            case 'low': return '$(check)';
            default: return '$(target)';
        }
    }
    async function analyzeWorkspace() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showWarningMessage('No workspace folder found');
            return;
        }
        const excludePatterns = vscode.workspace.getConfiguration('baselineCopilot').get('excludePatterns') || [];
        const filePattern = '**/*.{js,ts,jsx,tsx,css,html}';
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Analyzing workspace compatibility...",
            cancellable: true
        }, async (progress, token) => {
            const files = await vscode.workspace.findFiles(filePattern, `{${excludePatterns.join(',')}}`);
            let processedFiles = 0;
            for (const fileUri of files) {
                if (token.isCancellationRequested) {
                    break;
                }
                try {
                    const document = await vscode.workspace.openTextDocument(fileUri);
                    await analyzeDocument(document);
                    processedFiles++;
                    progress.report({
                        increment: (100 / files.length),
                        message: `Processed ${processedFiles}/${files.length} files`
                    });
                }
                catch (error) {
                    console.error(`Failed to analyze ${fileUri.fsPath}:`, error);
                }
            }
            vscode.window.showInformationMessage(`Workspace analysis complete: ${processedFiles} files processed`);
        });
    }
    async function generateReport() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showWarningMessage('No workspace folder found');
            return;
        }
        // Collect all diagnostics from the workspace
        const allDiagnostics = new Map();
        diagnosticCollection.forEach((uri, diagnostics) => {
            if (diagnostics.length > 0) {
                allDiagnostics.set(uri.fsPath, diagnostics);
            }
        });
        if (allDiagnostics.size === 0) {
            vscode.window.showInformationMessage('No compatibility issues found to report');
            return;
        }
        const report = generateMarkdownReport(allDiagnostics);
        const reportUri = vscode.Uri.joinPath(workspaceFolder.uri, 'baseline-compatibility-report.md');
        await vscode.workspace.fs.writeFile(reportUri, Buffer.from(report, 'utf8'));
        const openReport = await vscode.window.showInformationMessage('Compatibility report generated successfully!', 'Open Report', 'Show in Explorer');
        if (openReport === 'Open Report') {
            vscode.window.showTextDocument(reportUri);
        }
        else if (openReport === 'Show in Explorer') {
            vscode.commands.executeCommand('revealFileInOS', reportUri);
        }
    }
    function generateMarkdownReport(diagnostics) {
        const date = new Date().toLocaleDateString();
        const workspaceName = vscode.workspace.name || 'Unknown Workspace';
        let report = `# Browser Compatibility Report
        
Generated for **${workspaceName}** on ${date}

## Summary

- **Files Analyzed**: ${diagnostics.size}
- **Total Issues**: ${Array.from(diagnostics.values()).reduce((sum, diags) => sum + diags.length, 0)}

## Issues by File

`;
        diagnostics.forEach((fileDiagnostics, filePath) => {
            const relativePath = vscode.workspace.asRelativePath(filePath);
            report += `### ${relativePath}\n\n`;
            fileDiagnostics.forEach(diagnostic => {
                const severity = diagnostic.severity === vscode.DiagnosticSeverity.Error ? '🚨' :
                    diagnostic.severity === vscode.DiagnosticSeverity.Warning ? '⚠️' : 'ℹ️';
                report += `- ${severity} **Line ${diagnostic.range.start.line + 1}**: ${diagnostic.message}\n`;
                if (diagnostic.relatedInformation && diagnostic.relatedInformation.length > 0) {
                    report += `  - ${diagnostic.relatedInformation[0].message}\n`;
                }
            });
            report += '\n';
        });
        report += `
---
*Generated by Baseline Copilot VS Code Extension*
`;
        return report;
    }
    async function showCompatibilityPanel() {
        const panel = vscode.window.createWebviewPanel('baselineCompatibility', 'Baseline Copilot', vscode.ViewColumn.Two, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        panel.webview.html = getWebviewContent();
        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'analyzeCurrentFile':
                    await analyzeCurrentFile();
                    break;
                case 'generateReport':
                    await generateReport();
                    break;
                case 'openSettings':
                    vscode.commands.executeCommand('workbench.action.openSettings', 'baselineCopilot');
                    break;
            }
        });
    }
    function getWebviewContent() {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Baseline Copilot</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                }
                .header {
                    display: flex;
                    align-items: center;
                    margin-bottom: 20px;
                }
                .logo {
                    font-size: 24px;
                    margin-right: 10px;
                }
                .title {
                    font-size: 18px;
                    font-weight: bold;
                }
                .section {
                    margin: 20px 0;
                    padding: 15px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                }
                .button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    border-radius: 2px;
                    cursor: pointer;
                    margin: 5px;
                }
                .button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .stats {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                    gap: 10px;
                    margin: 10px 0;
                }
                .stat {
                    text-align: center;
                    padding: 10px;
                    background-color: var(--vscode-editorWidget-background);
                    border-radius: 4px;
                }
                .stat-value {
                    font-size: 24px;
                    font-weight: bold;
                    color: var(--vscode-charts-blue);
                }
                .stat-label {
                    font-size: 12px;
                    opacity: 0.8;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo">🎯</div>
                <div class="title">Baseline Copilot</div>
            </div>
            
            <div class="section">
                <h3>Quick Actions</h3>
                <button class="button" onclick="analyzeFile()">🔍 Analyze Current File</button>
                <button class="button" onclick="generateReport()">📊 Generate Report</button>
                <button class="button" onclick="openSettings()">⚙️ Settings</button>
            </div>
            
            <div class="section">
                <h3>Workspace Overview</h3>
                <div class="stats">
                    <div class="stat">
                        <div class="stat-value" id="fileCount">-</div>
                        <div class="stat-label">Files Analyzed</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value" id="issueCount">-</div>
                        <div class="stat-label">Issues Found</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value" id="riskLevel">-</div>
                        <div class="stat-label">Risk Level</div>
                    </div>
                </div>
            </div>
            
            <div class="section">
                <h3>About Baseline</h3>
                <p>Baseline helps you understand which web platform features are ready to use in your applications. Features become "Baseline" when they're supported across all major browsers.</p>
                <ul>
                    <li><strong>Newly available</strong> - Recently became Baseline</li>
                    <li><strong>Widely available</strong> - Baseline for 2+ years</li>
                    <li><strong>Limited support</strong> - Not yet Baseline</li>
                </ul>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                function analyzeFile() {
                    vscode.postMessage({ command: 'analyzeCurrentFile' });
                }
                
                function generateReport() {
                    vscode.postMessage({ command: 'generateReport' });
                }
                
                function openSettings() {
                    vscode.postMessage({ command: 'openSettings' });
                }
                
                // Update stats periodically
                function updateStats() {
                    // This would be populated with real data from the extension
                    document.getElementById('fileCount').textContent = '0';
                    document.getElementById('issueCount').textContent = '0';
                    document.getElementById('riskLevel').textContent = 'Low';
                }
                
                updateStats();
            </script>
        </body>
        </html>`;
    }
    context.subscriptions.push(diagnosticCollection, statusBarItem);
}
exports.activate = activate;
class BaselineHoverProvider {
    constructor(analyzer) {
        this.analyzer = analyzer;
    }
    async provideHover(document, position, token) {
        const line = document.lineAt(position.line);
        const code = line.text;
        try {
            const analysis = await this.analyzer.analyzeCode(code, document.languageId);
            const relevantIssues = analysis.issues.filter(issue => position.character >= issue.column - 1 &&
                position.character <= issue.column - 1 + issue.matchedText.length);
            if (relevantIssues.length === 0) {
                return undefined;
            }
            const issue = relevantIssues[0];
            const contents = new vscode.MarkdownString();
            contents.isTrusted = true;
            contents.appendMarkdown(`### ${issue.feature}\n\n`);
            contents.appendMarkdown(`**Status**: ${issue.status.replace('-', ' ')}\n\n`);
            contents.appendMarkdown(`**Browser Support**:\n`);
            Object.entries(issue.browsers).forEach(([browser, version]) => {
                contents.appendMarkdown(`- ${browser}: ${version}\n`);
            });
            if (issue.description) {
                contents.appendMarkdown(`\n${issue.description}\n\n`);
            }
            if (issue.fallback) {
                contents.appendMarkdown(`**Fallback**: ${issue.fallback}\n\n`);
            }
            if (issue.polyfill) {
                contents.appendMarkdown(`**Polyfill**: \`${issue.polyfill}\`\n\n`);
            }
            contents.appendMarkdown(`[📖 Learn more](${issue.mdn})`);
            return new vscode.Hover(contents);
        }
        catch (error) {
            return undefined;
        }
    }
}
class BaselineCodeActionProvider {
    provideCodeActions(document, range, context, token) {
        const actions = [];
        context.diagnostics
            .filter(diagnostic => diagnostic.source === 'baseline-copilot')
            .forEach(diagnostic => {
            // Add fallback suggestion
            const addFallbackAction = new vscode.CodeAction('Add fallback implementation', vscode.CodeActionKind.QuickFix);
            addFallbackAction.diagnostics = [diagnostic];
            addFallbackAction.command = {
                command: 'baselineCopilot.addFallback',
                title: 'Add fallback',
                arguments: [diagnostic.code, range]
            };
            actions.push(addFallbackAction);
            // Add polyfill suggestion
            const addPolyfillAction = new vscode.CodeAction('Add polyfill', vscode.CodeActionKind.QuickFix);
            addPolyfillAction.diagnostics = [diagnostic];
            addPolyfillAction.command = {
                command: 'baselineCopilot.addPolyfill',
                title: 'Add polyfill',
                arguments: [diagnostic.code]
            };
            actions.push(addPolyfillAction);
        });
        return actions;
    }
}
function deactivate() {
    console.log('Baseline Copilot extension deactivated');
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map