#!/usr/bin/env node
/**
 * ai-doc-updater.js - 2026 SOTA AI Documentation Regeneration
 * 
 * Tier-1 Practice: Autonomous documentation updates
 * Analyzes code changes and generates documentation update suggestions.
 * 
 * This script:
 * 1. Detects which files changed in the current commit/PR
 * 2. Maps changed code files to their documentation
 * 3. Analyzes the changes using AI (Gemini/OpenAI/Anthropic)
 * 4. Generates suggested doc updates
 * 
 * Usage: node ai-doc-updater.js [--dry-run] [--commit-sha <sha>]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration from ai-doc-config.yaml mappings
const CODE_TO_DOC_MAPPINGS = {
  'services/titan-execution-rs/src/security.rs': ['docs/canonical/SYSTEM_SOURCE_OF_TRUTH.md', 'docs/security/'],
  'services/titan-execution-rs/src/nats_engine.rs': ['docs/canonical/SYSTEM_SOURCE_OF_TRUTH.md', 'docs/architecture/'],
  'services/titan-execution-rs/src/risk_guard.rs': ['docs/canonical/SYSTEM_SOURCE_OF_TRUTH.md'],
  'services/titan-execution-rs/src/risk_policy.rs': ['docs/canonical/SYSTEM_SOURCE_OF_TRUTH.md'],
  'packages/shared/src/messaging/': ['docs/connectivity/', 'docs/canonical/SYSTEM_SOURCE_OF_TRUTH.md'],
  'apps/titan-console-api/src/routes/': ['docs/reference/openapi.yaml'],
  'config/nats.conf': ['docs/canonical/SYSTEM_SOURCE_OF_TRUTH.md', 'docs/operations/'],
  'docker-compose.prod.yml': ['docs/operations/', 'docs/canonical/SYSTEM_SOURCE_OF_TRUTH.md'],
};

const INVARIANT_SYMBOLS = [
  'HmacValidator', 'GlobalHalt', 'RiskGuard', 'TokenBucket', 'RiskState',
  'process_intent', 'validate_risk_command', 'EXECUTION_CORE'
];

class AIDocUpdater {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    this.commitSha = options.commitSha || 'HEAD';
    this.repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
    this.aiProvider = process.env.AI_DOC_PROVIDER || 'gemini'; // gemini, openai, anthropic, or local
  }

  /**
   * Get files changed in the specified commit/range
   */
  getChangedFiles() {
    try {
      const output = execSync(
        `git diff --name-only ${this.commitSha}^ ${this.commitSha} 2>/dev/null || git diff --name-only HEAD~1 HEAD`,
        { encoding: 'utf8', cwd: this.repoRoot }
      );
      return output.trim().split('\n').filter(f => f.length > 0);
    } catch (e) {
      console.error('Error getting changed files:', e.message);
      return [];
    }
  }

  /**
   * Map changed code files to affected documentation
   */
  mapChangesToDocs(changedFiles) {
    const affectedDocs = new Set();
    const codeChanges = [];

    for (const file of changedFiles) {
      // Skip if it's already a doc file
      if (file.startsWith('docs/')) continue;

      // Check for direct mappings
      for (const [pattern, docs] of Object.entries(CODE_TO_DOC_MAPPINGS)) {
        if (file.startsWith(pattern) || file === pattern) {
          docs.forEach(d => affectedDocs.add(d));
          codeChanges.push({ file, affectedDocs: docs });
        }
      }

      // Check for invariant symbol changes
      if (file.endsWith('.rs') || file.endsWith('.ts')) {
        const content = this.getFileContent(file);
        for (const symbol of INVARIANT_SYMBOLS) {
          if (content.includes(symbol)) {
            affectedDocs.add('docs/canonical/SYSTEM_SOURCE_OF_TRUTH.md');
            codeChanges.push({ file, symbol, affectedDocs: ['docs/canonical/SYSTEM_SOURCE_OF_TRUTH.md'] });
          }
        }
      }
    }

    return { affectedDocs: Array.from(affectedDocs), codeChanges };
  }

  /**
   * Get file content
   */
  getFileContent(filePath) {
    try {
      return fs.readFileSync(path.join(this.repoRoot, filePath), 'utf8');
    } catch (e) {
      return '';
    }
  }

  /**
   * Get diff for a specific file
   */
  getFileDiff(filePath) {
    try {
      return execSync(
        `git diff ${this.commitSha}^ ${this.commitSha} -- "${filePath}" 2>/dev/null || git diff HEAD~1 HEAD -- "${filePath}"`,
        { encoding: 'utf8', cwd: this.repoRoot }
      );
    } catch (e) {
      return '';
    }
  }

  /**
   * Generate AI prompt for documentation update
   */
  generatePrompt(codeChanges, affectedDocs) {
    const prompt = `
You are a documentation specialist analyzing code changes to determine if documentation updates are needed.

## Code Changes Summary
${codeChanges.map(c => `- ${c.file}${c.symbol ? ` (affects symbol: ${c.symbol})` : ''}`).join('\n')}

## Affected Documentation Files
${affectedDocs.join('\n')}

## Detailed Diffs
${codeChanges.slice(0, 5).map(c => `
### ${c.file}
\`\`\`diff
${this.getFileDiff(c.file).slice(0, 2000)}
\`\`\`
`).join('\n')}

## Task
Analyze these code changes and determine:
1. Which documentation files need updates
2. What specific changes are needed
3. Priority level (critical/important/minor)

Respond in JSON format:
{
  "updates_needed": [
    {
      "doc_file": "path/to/doc.md",
      "priority": "critical|important|minor",
      "reason": "Brief explanation",
      "suggested_change": "Specific text to update or add"
    }
  ],
  "summary": "Brief summary of all needed changes"
}
`;
    return prompt;
  }

  /**
   * Call AI provider for analysis
   */
  async analyzeWithAI(prompt) {
    if (this.aiProvider === 'local' || this.dryRun) {
      // Local/dry-run mode - return basic analysis
      return this.localAnalysis(prompt);
    }

    if (this.aiProvider === 'gemini' && process.env.GEMINI_API_KEY) {
      return await this.callGemini(prompt);
    }

    if (this.aiProvider === 'openai' && process.env.OPENAI_API_KEY) {
      return await this.callOpenAI(prompt);
    }

    if (this.aiProvider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
      return await this.callAnthropic(prompt);
    }

    // Auto-detect available provider
    if (process.env.GEMINI_API_KEY) {
      return await this.callGemini(prompt);
    }
    if (process.env.OPENAI_API_KEY) {
      return await this.callOpenAI(prompt);
    }
    if (process.env.ANTHROPIC_API_KEY) {
      return await this.callAnthropic(prompt);
    }

    console.log('No AI API key configured, using local analysis');
    return this.localAnalysis(prompt);
  }

  /**
   * Local analysis without AI
   */
  localAnalysis(prompt) {
    // Extract affected docs from prompt
    const docsMatch = prompt.match(/## Affected Documentation Files\n([\s\S]*?)\n\n##/);
    const docs = docsMatch ? docsMatch[1].trim().split('\n') : [];

    return {
      updates_needed: docs.map(doc => ({
        doc_file: doc,
        priority: 'minor',
        reason: 'Code files affecting this documentation were modified',
        suggested_change: 'Review and update based on code changes'
      })),
      summary: `${docs.length} documentation file(s) may need review based on code changes`
    };
  }

  /**
   * Call OpenAI API
   */
  async callOpenAI(prompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo-preview',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 2000
      })
    });

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  }

  /**
   * Call Anthropic API
   */
  async callAnthropic(prompt) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2024-01-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const content = data.content[0].text;
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { updates_needed: [], summary: 'Failed to parse response' };
  }

  /**
   * Call Google Gemini API (supports both API key and ADC)
   * 
   * Authentication priority:
   * 1. GEMINI_API_KEY environment variable (direct API key)
   * 2. Application Default Credentials via gcloud CLI
   *    - Run: gcloud auth application-default login
   *    - Uses: gcloud auth application-default print-access-token
   */
  async callGemini(prompt) {
    const model = 'gemini-2.0-flash-exp';
    
    // Check for API key first
    if (process.env.GEMINI_API_KEY) {
      return await this.callGeminiWithApiKey(prompt, model);
    }
    
    // Fall back to ADC (Application Default Credentials)
    return await this.callGeminiWithADC(prompt, model);
  }

  /**
   * Call Gemini using API key
   */
  async callGeminiWithApiKey(prompt, model) {
    const apiKey = process.env.GEMINI_API_KEY;
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt + '\n\nIMPORTANT: Respond with valid JSON only, no markdown formatting.'
            }]
          }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2000,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    return this.parseGeminiResponse(await response.json(), prompt);
  }

  /**
   * Call Gemini using Application Default Credentials (ADC)
   * Requires: gcloud auth application-default login
   */
  async callGeminiWithADC(prompt, model) {
    // Get access token from gcloud CLI
    let accessToken;
    try {
      accessToken = execSync('gcloud auth application-default print-access-token 2>/dev/null', { 
        encoding: 'utf8' 
      }).trim();
    } catch (e) {
      console.log('ADC not configured. Run: gcloud auth application-default login');
      console.log('Falling back to local analysis');
      return this.localAnalysis(prompt);
    }

    if (!accessToken) {
      console.log('No access token available, using local analysis');
      return this.localAnalysis(prompt);
    }

    console.log('Using Application Default Credentials (ADC) for Gemini');

    // Use Vertex AI endpoint with OAuth token
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || this.getGcloudProject();
    const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
    
    if (!projectId) {
      console.log('No Google Cloud project configured. Set GOOGLE_CLOUD_PROJECT or run: gcloud config set project YOUR_PROJECT');
      return this.localAnalysis(prompt);
    }

    const response = await fetch(
      `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{
              text: prompt + '\n\nIMPORTANT: Respond with valid JSON only, no markdown formatting.'
            }]
          }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2000,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    return this.parseGeminiResponse(await response.json(), prompt);
  }

  /**
   * Get Google Cloud project from gcloud config
   */
  getGcloudProject() {
    try {
      return execSync('gcloud config get-value project 2>/dev/null', { encoding: 'utf8' }).trim();
    } catch (e) {
      return null;
    }
  }

  /**
   * Parse Gemini API response
   */
  parseGeminiResponse(data, prompt) {
    if (data.error) {
      console.error('Gemini API error:', data.error.message || JSON.stringify(data.error));
      return this.localAnalysis(prompt);
    }

    try {
      const text = data.candidates[0].content.parts[0].text;
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : { updates_needed: [], summary: 'Failed to parse response' };
    } catch (e) {
      console.error('Error parsing Gemini response:', e.message);
      return this.localAnalysis(prompt);
    }
  }

  /**
   * Generate GitHub issue/PR body
   */
  generateGitHubBody(analysis) {
    let body = `## 🤖 AI Documentation Update Recommendation

${analysis.summary}

### Updates Needed

| Documentation File | Priority | Reason |
|-------------------|----------|--------|
`;

    for (const update of analysis.updates_needed) {
      body += `| \`${update.doc_file}\` | ${update.priority.toUpperCase()} | ${update.reason} |\n`;
    }

    body += `
### Suggested Changes

`;

    for (const update of analysis.updates_needed) {
      body += `#### ${update.doc_file}
${update.suggested_change}

`;
    }

    body += `
---
*This analysis was generated automatically by the AI Documentation Updater.*
*Review with \`./scripts/docs/detect-staleness.sh\` for staleness details.*
`;

    return body;
  }

  /**
   * Main execution
   */
  async run() {
    console.log('🤖 AI Documentation Updater');
    console.log('===========================');
    console.log(`Mode: ${this.dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`Commit: ${this.commitSha}`);
    console.log('');

    // Step 1: Get changed files
    const changedFiles = this.getChangedFiles();
    console.log(`Found ${changedFiles.length} changed file(s)`);

    if (changedFiles.length === 0) {
      console.log('No files changed, exiting');
      return { updates_needed: [], summary: 'No changes detected' };
    }

    // Step 2: Map to affected docs
    const { affectedDocs, codeChanges } = this.mapChangesToDocs(changedFiles);
    console.log(`Mapped to ${affectedDocs.length} potentially affected doc(s)`);

    if (affectedDocs.length === 0) {
      console.log('No documentation affected, exiting');
      return { updates_needed: [], summary: 'No documentation affected by changes' };
    }

    // Step 3: Generate prompt and analyze
    const prompt = this.generatePrompt(codeChanges, affectedDocs);
    console.log('Analyzing with AI...');
    const analysis = await this.analyzeWithAI(prompt);

    // Step 4: Output results
    console.log('');
    console.log('Analysis Results:');
    console.log(JSON.stringify(analysis, null, 2));

    // Step 5: Generate GitHub body
    const githubBody = this.generateGitHubBody(analysis);
    
    // Write to file for GitHub Action to pick up
    const outputPath = path.join(this.repoRoot, '.github', 'ai-doc-analysis.md');
    fs.writeFileSync(outputPath, githubBody);
    console.log(`\nWrote analysis to ${outputPath}`);

    // Set GitHub Actions outputs if running in CI
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_updates=${analysis.updates_needed.length > 0}\n`);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `update_count=${analysis.updates_needed.length}\n`);
    }

    return analysis;
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    dryRun: args.includes('--dry-run'),
    commitSha: args.includes('--commit-sha') ? args[args.indexOf('--commit-sha') + 1] : 'HEAD'
  };

  const updater = new AIDocUpdater(options);
  updater.run().then(result => {
    if (result.updates_needed.length > 0) {
      process.exit(0); // Updates needed but not an error
    }
    process.exit(0);
  }).catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}

module.exports = { AIDocUpdater };
