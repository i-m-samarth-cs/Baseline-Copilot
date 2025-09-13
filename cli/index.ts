#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { table } from 'table';
import inquirer from 'inquirer';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { EnhancedBaselineAnalyzer } from './analyzer';

interface CLIOptions {
    output?: string;
    format?: 'table' | 'json' | 'markdown' | 'junit';
    target?: string[];
    risk?: 'low' | 'medium' | 'high';
    exclude?: string[];
    include?: string[];
    watch?: boolean;
    fix?: boolean;
    interactive?: boolean;
    ci?: boolean;
    threshold?: number;
}

interface AnalysisResult {
    file: string;
    issues: any[];
    summary: any;
    performance: any;
}

class BaselineCopilotCLI {
    private analyzer: EnhancedBaselineAnalyzer;
    private program: Command;

    constructor() {
        this.analyzer = new EnhancedBaselineAnalyzer();
        this.program = new Command();
        this.setupCommands();
    }

    private setupCommands() {
        this.program
            .name('baseline-copilot')
            .description('Browser compatibility analysis tool using Baseline data')
            .version('1.0.0')
            .option('-o, --output <file>', 'output file for results')
            .option('-f, --format <format>', 'output format (table, json, markdown, junit)', 'table')
            .option('-t, --target <browsers...>', 'target browsers', ['chrome', 'firefox', 'safari', 'edge'])
            .option('-r, --risk <level>', 'acceptable risk level', 'medium')
            .option('-e, --exclude <patterns...>', 'exclude file patterns', ['node_modules/**', 'dist/**'])
            .option('-i, --include <patterns...>', 'include file patterns', ['**/*.{js,ts,jsx,tsx,css,html}'])
            .option('-w, --watch', 'watch for file changes')
            .option('--fix', 'automatically apply fixes where possible')
            .option('--interactive', 'interactive mode')
            .option('--ci', 'CI mode - fail on threshold exceeded')
            .option('--threshold <number>', 'fail threshold for CI mode', '10');

        // Main analyze command
        this.program
            .command('analyze [files...]')
            .description('analyze files for browser compatibility issues')
            .action((files, options) => this.analyzeCommand(files, { ...this.program.opts(), ...options }));

        // Report command
        this.program
            .command('report')
            .description('generate detailed compatibility report')
            .option('-t, --template <template>', 'report template', 'default')
            .action((options) => this.reportCommand({ ...this.program.opts(), ...options }));

        // Init command
        this.program
            .command('init')
            .description('initialize baseline-copilot configuration')
            .action(() => this.initCommand());

        // Check command for CI/CD
        this.program
            .command('check')
            .description('check compatibility and exit with status code')
            .action((options) => this.checkCommand({ ...this.program.opts(), ...options }));

        // Fix command
        this.program
            .command('fix [files...]')
            .description('automatically fix compatibility issues where possible')
            .action((files, options) => this.fixCommand(files, { ...this.program.opts(), ...options }));

        // Watch command
        this.program
            .command('watch [files...]')
            .description('watch files for changes and analyze continuously')
            .action((files, options) => this.watchCommand(files, { ...this.program.opts(), ...options }));

        // Community commands
        this.program
            .command('vote <feature> <vote>')
            .description('vote on community features (up/down)')
            .action((feature, vote) => this.voteCommand(feature, vote));

        this.program
            .command('request <feature>')
            .description('request analysis for new feature')
            .action((feature) => this.requestCommand(feature));
    }

    async run() {
        await this.program.parseAsync();
    }

    private async analyzeCommand(files: string[], options: CLIOptions) {
        const spinner = ora('Initializing Baseline Copilot...').start();

        try {
            // Resolve file patterns
            const filePatterns = files.length > 0 ? files : options.include || ['**/*.{js,ts,jsx,tsx,css,html}'];
            const excludePatterns = options.exclude || ['node_modules/**', 'dist/**'];
            
            const filesToAnalyze = await this.resolveFiles(filePatterns, excludePatterns);
            
            if (filesToAnalyze.length === 0) {
                spinner.fail('No files found to analyze');
                return;
            }

            spinner.text = `Analyzing ${filesToAnalyze.length} files...`;

            const results: AnalysisResult[] = [];
            let processedFiles = 0;

            for (const file of filesToAnalyze) {
                try {
                    const content = await fs.readFile(file, 'utf-8');
                    const analysis = await this.analyzer.analyzeCode(content, this.getLanguageFromFile(file));
                    
                    results.push({
                        file: path.relative(process.cwd(), file),
                        issues: analysis.issues,
                        summary: analysis.summary,
                        performance: analysis.summary.performanceImpact
                    });

                    processedFiles++;
                    spinner.text = `Analyzing... ${processedFiles}/${filesToAnalyze.length}`;
                } catch (error) {
                    console.warn(chalk.yellow(`Warning: Could not analyze ${file}: ${error}`));
                }
            }

            spinner.succeed(`Analysis complete: ${processedFiles} files processed`);

            // Output results
            await this.outputResults(results, options);

            // Summary
            const totalIssues = results.reduce((sum, result) => sum + result.issues.length, 0);
            const highRiskFiles = results.filter(r => r.summary.riskLevel === 'high').length;

            console.log(chalk.bold('\n📊 Analysis Summary:'));
            console.log(`Files analyzed: ${processedFiles}`);
            console.log(`Total issues: ${totalIssues}`);
            console.log(`High risk files: ${highRiskFiles}`);

            if (options.ci && totalIssues > (options.threshold || 10)) {
                console.log(chalk.red(`❌ CI check failed: ${totalIssues} issues exceed threshold of ${options.threshold}`));
                process.exit(1);
            }

        } catch (error) {
            spinner.fail(`Analysis failed: ${error}`);
            process.exit(1);
        }
    }

    private async outputResults(results: AnalysisResult[], options: CLIOptions) {
        const output = await this.formatResults(results, options.format || 'table');

        if (options.output) {
            await fs.writeFile(options.output, output);
            console.log(chalk.green(`Results saved to ${options.output}`));
        } else {
            console.log(output);
        }
    }

    private async formatResults(results: AnalysisResult[], format: string): Promise<string> {
        switch (format) {
            case 'json':
                return JSON.stringify(results, null, 2);
                
            case 'markdown':
                return this.formatMarkdown(results);
                
            case 'junit':
                return this.formatJUnit(results);
                
            case 'table':
            default:
                return this.formatTable(results);
        }
    }

    private formatTable(results: AnalysisResult[]): string {
        const data = [
            ['File', 'Issues', 'Risk', 'Score', 'Performance']
        ];

        results.forEach(result => {
            const riskColor = result.summary.riskLevel === 'high' ? chalk.red :
                            result.summary.riskLevel === 'medium' ? chalk.yellow : chalk.green;
            
            data.push([
                result.file,
                result.issues.length.toString(),
                riskColor(result.summary.riskLevel.toUpperCase()),
                `${result.summary.compatibilityScore}/100`,
                result.performance?.impact || 'minimal'
            ]);
        });

        return table(data, {
            header: {
                alignment: 'center',
                content: chalk.bold('Browser Compatibility Analysis Results')
            }
        });
    }

    private formatMarkdown(results: AnalysisResult[]): string {
        const date = new Date().toLocaleDateString();
        let markdown = `# Browser Compatibility Analysis Report

Generated on ${date}

## Summary

| File | Issues | Risk Level | Compatibility Score | Performance Impact |
|------|--------|------------|--------------------|--------------------|
`;

        results.forEach(result => {
            markdown += `| ${result.file} | ${result.issues.length} | ${result.summary.riskLevel} | ${result.summary.compatibilityScore}/100 | ${result.performance?.impact || 'minimal'} |\n`;
        });

        markdown += '\n## Detailed Issues\n\n';

        results.forEach(result => {
            if (result.issues.length > 0) {
                markdown += `### ${result.file}\n\n`;
                result.issues.forEach(issue => {
                    markdown += `- **${issue.feature}** (Line ${issue.line}): ${issue.status}\n`;
                    markdown += `  - Browser support: ${Object.entries(issue.browsers).map(([browser, version]) => `${browser} ${version}`).join(', ')}\n`;
                    if (issue.fallback) {
                        markdown += `  - Fallback: ${issue.fallback}\n`;
                    }
                    markdown += '\n';
                });
            }
        });

        return markdown;
    }

    private formatJUnit(results: AnalysisResult[]): string {
        const totalTests = results.length;
        const failures = results.filter(r => r.summary.riskLevel === 'high').length;
        const errors = results.filter(r => r.issues.some(i => i.severity === 'error')).length;

        let junit = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="baseline-copilot" tests="${totalTests}" failures="${failures}" errors="${errors}" time="0">
  <testsuite name="Browser Compatibility" tests="${totalTests}" failures="${failures}" errors="${errors}" time="0">
`;

        results.forEach(result => {
            const hasFailures = result.summary.riskLevel === 'high';
            const hasErrors = result.issues.some(i => i.severity === 'error');

            junit += `    <testcase classname="compatibility" name="${result.file}" time="0">`;

            if (hasErrors) {
                junit += `
      <error message="Compatibility errors found">
${result.issues.filter(i => i.severity === 'error').map(i => `        ${i.feature}: ${i.status}`).join('\n')}
      </error>`;
            }

            if (hasFailures && !hasErrors) {
                junit += `
      <failure message="High compatibility risk">
        Risk Level: ${result.summary.riskLevel}
        Issues: ${result.issues.length}
        Score: ${result.summary.compatibilityScore}/100
      </failure>`;
            }

            junit += `
    </testcase>
`;
        });

        junit += `  </testsuite>
</testsuites>`;

        return junit;
    }

    private async resolveFiles(patterns: string[], excludePatterns: string[]): Promise<string[]> {
        const allFiles: string[] = [];

        for (const pattern of patterns) {
            const files = await glob(pattern, {
                ignore: excludePatterns,
                absolute: true
            });
            allFiles.push(...files);
        }

        // Remove duplicates and filter for supported file types
        const supportedExtensions = ['.js', '.ts', '.jsx', '.tsx', '.css', '.html'];
        return [...new Set(allFiles)].filter(file => 
            supportedExtensions.some(ext => file.endsWith(ext))
        );
    }

    private getLanguageFromFile(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const languageMap: Record<string, string> = {
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.css': 'css',
            '.html': 'html'
        };
        return languageMap[ext] || 'javascript';
    }

    private async reportCommand(options: CLIOptions) {
        const spinner = ora('Generating detailed report...').start();

        try {
            // First analyze all files
            const files = await this.resolveFiles(
                options.include || ['**/*.{js,ts,jsx,tsx,css,html}'],
                options.exclude || ['node_modules/**', 'dist/**']
            );

            const results: AnalysisResult[] = [];

            for (const file of files) {
                const content = await fs.readFile(file, 'utf-8');
                const analysis = await this.analyzer.analyzeCode(content, this.getLanguageFromFile(file));
                results.push({
                    file: path.relative(process.cwd(), file),
                    issues: analysis.issues,
                    summary: analysis.summary,
                    performance: analysis.summary.performanceImpact
                });
            }

            // Generate comprehensive report
            const report = await this.generateDetailedReport(results);
            const outputFile = options.output || `baseline-report-${Date.now()}.md`;
            
            await fs.writeFile(outputFile, report);
            spinner.succeed(`Detailed report generated: ${outputFile}`);

            // Show quick stats
            const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
            const avgScore = Math.round(results.reduce((sum, r) => sum + r.summary.compatibilityScore, 0) / results.length);

            console.log(chalk.bold('\n📈 Report Statistics:'));
            console.log(`Files analyzed: ${results.length}`);
            console.log(`Total compatibility issues: ${totalIssues}`);
            console.log(`Average compatibility score: ${avgScore}/100`);

        } catch (error) {
            spinner.fail(`Report generation failed: ${error}`);
        }
    }

    private async generateDetailedReport(results: AnalysisResult[]): Promise<string> {
        const date = new Date().toLocaleDateString();
        const time = new Date().toLocaleTimeString();

        // Aggregate statistics
        const totalFiles = results.length;
        const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
        const avgScore = Math.round(results.reduce((sum, r) => sum + r.summary.compatibilityScore, 0) / results.length);
        
        // Risk distribution
        const riskDistribution = results.reduce((acc, r) => {
            acc[r.summary.riskLevel] = (acc[r.summary.riskLevel] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        // Top issues
        const allIssues = results.flatMap(r => r.issues);
        const featureCounts = allIssues.reduce((acc, issue) => {
            acc[issue.feature] = (acc[issue.feature] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const topIssues = Object.entries(featureCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10);

        return `# Comprehensive Browser Compatibility Report

*Generated by Baseline Copilot CLI on ${date} at ${time}*

## Executive Summary

- **Files Analyzed**: ${totalFiles}
- **Total Compatibility Issues**: ${totalIssues}
- **Average Compatibility Score**: ${avgScore}/100
- **Overall Risk Assessment**: ${this.getOverallRisk(riskDistribution)}

## Risk Distribution

| Risk Level | File Count | Percentage |
|------------|------------|------------|
| Low | ${riskDistribution.low || 0} | ${Math.round((riskDistribution.low || 0) / totalFiles * 100)}% |
| Medium | ${riskDistribution.medium || 0} | ${Math.round((riskDistribution.medium || 0) / totalFiles * 100)}% |
| High | ${riskDistribution.high || 0} | ${Math.round((riskDistribution.high || 0) / totalFiles * 100)}% |

## Top Compatibility Issues

${topIssues.map(([feature, count], index) => 
    `${index + 1}. **${feature}** - ${count} occurrence${count > 1 ? 's' : ''}`
).join('\n')}

## Performance Impact Analysis

${this.generatePerformanceSection(results)}

## File-by-File Analysis

${results.map(result => this.generateFileSection(result)).join('\n')}

## Recommendations

${this.generateRecommendations(results)}

---
*Report generated by Baseline Copilot CLI v1.0.0*
`;
    }

    private getOverallRisk(distribution: Record<string, number>): string {
        const high = distribution.high || 0;
        const medium = distribution.medium || 0;
        const total = Object.values(distribution).reduce((sum, count) => sum + count, 0);

        if (high / total > 0.3) return 'HIGH';
        if ((high + medium) / total > 0.5) return 'MEDIUM';
        return 'LOW';
    }

    private generatePerformanceSection(results: AnalysisResult[]): string {
        const performanceImpacts = results.map(r => r.performance).filter(Boolean);
        
        if (performanceImpacts.length === 0) {
            return 'No performance impact data available.';
        }

        const totalBundleSize = performanceImpacts.reduce((sum, p) => {
            const match = p.bundleSize?.match(/(\d+)KB/);
            return sum + (match ? parseInt(match[1]) : 0);
        }, 0);

        return `### Bundle Size Impact
- **Total Estimated Bundle Size**: ${totalBundleSize}KB
- **Recommendation**: ${totalBundleSize > 50 ? 'Consider code splitting and lazy loading' : 'Acceptable overhead'}

### Performance Recommendations
${performanceImpacts.map(p => `- ${p.recommendation}`).join('\n')}`;
    }

    private generateFileSection(result: AnalysisResult): string {
        if (result.issues.length === 0) {
            return `### ✅ ${result.file}\n*No compatibility issues found*\n`;
        }

        return `### ${this.getRiskEmoji(result.summary.riskLevel)} ${result.file}

**Compatibility Score**: ${result.summary.compatibilityScore}/100  
**Risk Level**: ${result.summary.riskLevel.toUpperCase()}  
**Issues Found**: ${result.issues.length}

${result.issues.map(issue => `
#### ${issue.feature} (Line ${issue.line})
- **Status**: ${issue.status.replace('-', ' ')}
- **Browser Support**: ${Object.entries(issue.browsers).map(([browser, version]) => `${browser} ${version}`).join(', ')}
${issue.fallback ? `- **Fallback**: ${issue.fallback}` : ''}
${issue.polyfill ? `- **Polyfill**: \`${issue.polyfill}\`` : ''}
- **More Info**: [MDN Documentation](${issue.mdn})
`).join('')}

---
`;
    }

    private getRiskEmoji(riskLevel: string): string {
        switch (riskLevel) {
            case 'high': return '🚨';
            case 'medium': return '⚠️';
            case 'low': return '✅';
            default: return '📋';
        }
    }

    private generateRecommendations(results: AnalysisResult[]): string {
        const recommendations: string[] = [];
        
        const highRiskFiles = results.filter(r => r.summary.riskLevel === 'high');
        if (highRiskFiles.length > 0) {
            recommendations.push(`🚨 **Immediate Action Required**: ${highRiskFiles.length} files have high compatibility risks. Review and implement fallbacks or polyfills.`);
        }

        const errorFeatures = results.flatMap(r => r.issues).filter(i => i.severity === 'error');
        if (errorFeatures.length > 0) {
            recommendations.push(`🔧 **Add Polyfills**: Consider adding polyfills for unsupported features: ${[...new Set(errorFeatures.map(f => f.feature))].join(', ')}`);
        }

        const totalBundleImpact = results.reduce((sum, r) => {
            const match = r.performance?.bundleSize?.match(/(\d+)KB/);
            return sum + (match ? parseInt(match[1]) : 0);
        }, 0);

        if (totalBundleImpact > 100) {
            recommendations.push(`📦 **Bundle Optimization**: Total polyfill overhead is ${totalBundleImpact}KB. Consider feature detection and progressive enhancement.`);
        }

        if (recommendations.length === 0) {
            recommendations.push('✅ **Good Job!** Your code shows good browser compatibility practices.');
        }

        return recommendations.map(rec => `- ${rec}`).join('\n');
    }

    private async initCommand() {
        console.log(chalk.bold('🎯 Initializing Baseline Copilot\n'));

        const answers = await inquirer.prompt([
            {
                type: 'checkbox',
                name: 'browsers',
                message: 'Which browsers do you want to target?',
                choices: [
                    { name: 'Chrome', value: 'chrome', checked: true },
                    { name: 'Firefox', value: 'firefox', checked: true },
                    { name: 'Safari', value: 'safari', checked: true },
                    { name: 'Edge', value: 'edge', checked: true }
                ]
            },
            {
                type: 'list',
                name: 'riskTolerance',
                message: 'What is your risk tolerance for new features?',
                choices: [
                    { name: 'Low - Only widely supported features', value: 'low' },
                    { name: 'Medium - Recently baseline features are acceptable', value: 'medium' },
                    { name: 'High - Cutting edge features with fallbacks', value: 'high' }
                ]
            },
            {
                type: 'input',
                name: 'includePatterns',
                message: 'File patterns to analyze (comma-separated):',
                default: '**/*.{js,ts,jsx,tsx,css,html}'
            },
            {
                type: 'input',
                name: 'excludePatterns',
                message: 'File patterns to exclude (comma-separated):',
                default: 'node_modules/**,dist/**,build/**'
            }
        ]);

        const config = {
            browsers: answers.browsers,
            riskTolerance: answers.riskTolerance,
            include: answers.includePatterns.split(',').map(s => s.trim()),
            exclude: answers.excludePatterns.split(',').map(s => s.trim()),
            threshold: 10,
            autoFix: false
        };

        await fs.writeFile('.baselinerc.json', JSON.stringify(config, null, 2));
        console.log(chalk.green('\n✅ Configuration saved to .baselinerc.json'));
        console.log(chalk.blue('\n🚀 You can now run: baseline-copilot analyze'));
    }

    private async checkCommand(options: CLIOptions) {
        // CI-friendly version that exits with appropriate codes
        try {
            const files = await this.resolveFiles(
                options.include || ['**/*.{js,ts,jsx,tsx,css,html}'],
                options.exclude || ['node_modules/**', 'dist/**']
            );

            let totalIssues = 0;
            let errorCount = 0;

            for (const file of files) {
                const content = await fs.readFile(file, 'utf-8');
                const analysis = await this.analyzer.analyzeCode(content, this.getLanguageFromFile(file));
                
                totalIssues += analysis.issues.length;
                errorCount += analysis.issues.filter(i => i.severity === 'error').length;
            }

            const threshold = options.threshold || 10;

            console.log(`Analyzed ${files.length} files`);
            console.log(`Found ${totalIssues} compatibility issues (${errorCount} errors)`);

            if (errorCount > 0) {
                console.log(chalk.red(`❌ Check failed: ${errorCount} compatibility errors found`));
                process.exit(1);
            } else if (totalIssues > threshold) {
                console.log(chalk.yellow(`⚠️ Check passed with warnings: ${totalIssues} issues exceed threshold of ${threshold}`));
                process.exit(0);
            } else {
                console.log(chalk.green(`✅ Check passed: ${totalIssues} issues within acceptable threshold`));
                process.exit(0);
            }

        } catch (error) {
            console.error(chalk.red(`❌ Check failed: ${error}`));
            process.exit(1);
        }
    }

    private async fixCommand(files: string[], options: CLIOptions) {
        console.log(chalk.bold('🔧 Auto-fixing compatibility issues...\n'));

        const filesToProcess = files.length > 0 ? files : await this.resolveFiles(
            options.include || ['**/*.{js,ts,jsx,tsx,css,html}'],
            options.exclude || ['node_modules/**', 'dist/**']
        );

        let fixedCount = 0;

        for (const file of filesToProcess) {
            const content = await fs.readFile(file, 'utf-8');
            const fixedContent = await this.applyAutoFixes(content, this.getLanguageFromFile(file));

            if (fixedContent !== content) {
                await fs.writeFile(file, fixedContent);
                console.log(chalk.green(`✅ Fixed: ${path.relative(process.cwd(), file)}`));
                fixedCount++;
            }
        }

        console.log(chalk.bold(`\n🎉 Auto-fix complete: ${fixedCount} files modified`));
        
        if (fixedCount > 0) {
            console.log(chalk.blue('💡 Run the analysis again to verify fixes'));
        }
    }

    private async applyAutoFixes(content: string, language: string): Promise<string> {
        let fixedContent = content;

        // Example fixes (simplified)
        if (language === 'javascript' || language === 'typescript') {
            // Replace array.at(-1) with array[array.length - 1] for older browsers
            fixedContent = fixedContent.replace(
                /(\w+)\.at\((-?\d+)\)/g,
                (match, arrayName, index) => {
                    if (index === '-1') {
                        return `${arrayName}[${arrayName}.length - 1]`;
                    }
                    return match;
                }
            );

            // Add feature detection for dialog.showModal()
            fixedContent = fixedContent.replace(
                /(\w+)\.showModal\(\)/g,
                '$1.showModal ? $1.showModal() : ($1.style.display = "block")'
            );
        }

        return fixedContent;
    }

    private async watchCommand(files: string[], options: CLIOptions) {
        console.log(chalk.bold('👀 Watching files for changes...\n'));

        const chokidar = require('chokidar');
        const patterns = files.length > 0 ? files : options.include || ['**/*.{js,ts,jsx,tsx,css,html}'];
        const ignored = options.exclude || ['node_modules/**', 'dist/**'];

        const watcher = chokidar.watch(patterns, { ignored });

        watcher.on('change', async (filePath: string) => {
            console.log(chalk.blue(`🔍 Analyzing ${filePath}...`));
            
            try {
                const content = await fs.readFile(filePath, 'utf-8');
                const analysis = await this.analyzer.analyzeCode(content, this.getLanguageFromFile(filePath));
                
                if (analysis.issues.length > 0) {
                    console.log(chalk.yellow(`⚠️ ${analysis.issues.length} issues found in ${filePath}`));
                    analysis.issues.forEach(issue => {
                        console.log(`  - Line ${issue.line}: ${issue.feature} (${issue.status})`);
                    });
                } else {
                    console.log(chalk.green(`✅ No issues in ${filePath}`));
                }
            } catch (error) {
                console.error(chalk.red(`❌ Error analyzing ${filePath}: ${error}`));
            }
        });

        console.log('Press Ctrl+C to stop watching...');

        process.on('SIGINT', () => {
            watcher.close();
            console.log(chalk.blue('\n👋 Stopped watching files'));
            process.exit(0);
        });
    }

    private async voteCommand(feature: string, vote: string) {
        if (!['up', 'down'].includes(vote)) {
            console.error(chalk.red('❌ Vote must be "up" or "down"'));
            return;
        }

        console.log(chalk.blue(`🗳️ Voting ${vote} on feature: ${feature}`));
        
        try {
            await this.analyzer.voteOnFeature(feature, vote);
            console.log(chalk.green('✅ Vote recorded successfully!'));
        } catch (error) {
            console.error(chalk.red(`❌ Failed to record vote: ${error}`));
        }
    }

    private async requestCommand(feature: string) {
        console.log(chalk.blue(`📝 Requesting analysis for feature: ${feature}`));

        const details = await inquirer.prompt([
            {
                type: 'input',
                name: 'description',
                message: 'Describe the feature:'
            },
            {
                type: 'input',
                name: 'useCase',
                message: 'What is your use case?'
            }
        ]);

        try {
            const result = await this.analyzer.submitFeatureRequest({
                name: feature,
                description: details.description,
                useCase: details.useCase,
                submittedBy: 'cli-user',
                submittedAt: new Date().toISOString()
            });

            console.log(chalk.green(`✅ Feature request submitted! ID: ${result.id}`));
        } catch (error) {
            console.error(chalk.red(`❌ Failed to submit request: ${error}`));
        }
    }
}

// Export for programmatic use
export { BaselineCopilotCLI };

// CLI entry point
if (require.main === module) {
    const cli = new BaselineCopilotCLI();
    cli.run().catch(error => {
        console.error(chalk.red(`Fatal error: ${error}`));
        process.exit(1);
    });
}