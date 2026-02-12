/**
 * Monitoring Config Validation - M16
 *
 * Validates that prometheus.yml, alert-rules.yml, and grafana dashboard JSON
 * are parseable and contain expected structure.
 *
 * Run: node --loader ts-node/esm scripts/sota/monitoring-config.test.ts
 *   or: npx tsx scripts/sota/monitoring-config.test.ts
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import jsYaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    failed++;
  }
}

function section(name: string): void {
  console.log(`\n🔍 ${name}`);
}

// --- 1. Prometheus Config ---
section('Prometheus Configuration (infra/monitoring/prometheus.yml)');

const promPath = resolve(ROOT, 'infra/monitoring/prometheus.yml');
assert(existsSync(promPath), 'prometheus.yml exists');

const promContent = readFileSync(promPath, 'utf-8');
const promConfig = jsYaml.load(promContent) as Record<string, unknown>;

assert(promConfig.global != null, 'global section exists');
assert(
  (promConfig.global as Record<string, unknown>)?.scrape_interval != null,
  `scrape_interval is set: ${(promConfig.global as Record<string, unknown>)?.scrape_interval}`,
);

const scrapeConfigs = promConfig.scrape_configs as Array<{ job_name: string }>;
assert(Array.isArray(scrapeConfigs), 'scrape_configs is an array');

const jobNames = scrapeConfigs?.map((sc) => sc.job_name) ?? [];
const requiredJobs = ['titan-brain', 'titan-execution', 'titan-scavenger', 'prometheus'];
for (const job of requiredJobs) {
  assert(jobNames.includes(job), `Required scrape job '${job}' is configured`);
}

assert(Array.isArray(promConfig.rule_files), 'rule_files section exists');

// --- 2. Alert Rules ---
section('Alert Rules (services/titan-brain/monitoring/alert-rules.yml)');

const alertPath = resolve(ROOT, 'services/titan-brain/monitoring/alert-rules.yml');
assert(existsSync(alertPath), 'alert-rules.yml exists');

const alertContent = readFileSync(alertPath, 'utf-8');
const alertConfig = jsYaml.load(alertContent) as Record<string, unknown>;

const groups = alertConfig.groups as Array<{ name: string }>;
assert(Array.isArray(groups), 'groups is an array');

const alertGroupNames = groups?.map((g) => g.name) ?? [];
const requiredGroups = ['titan.critical', 'titan.performance', 'titan.trading'];
for (const group of requiredGroups) {
  assert(alertGroupNames.includes(group), `Required alert group '${group}' exists`);
}

// --- 3. Grafana Dashboard ---
section('Grafana Dashboard (services/titan-brain/monitoring/grafana-dashboard-comprehensive.json)');

const dashPath = resolve(ROOT, 'services/titan-brain/monitoring/grafana-dashboard-comprehensive.json');
assert(existsSync(dashPath), 'Grafana dashboard JSON exists');

const dashContent = readFileSync(dashPath, 'utf-8');
const dashboard = JSON.parse(dashContent) as { dashboard?: { panels?: unknown[] } };

assert(dashboard.dashboard != null, 'dashboard object exists');
assert(
  Array.isArray(dashboard.dashboard?.panels),
  `dashboard has panels: ${dashboard.dashboard?.panels?.length}`,
);
assert(
  (dashboard.dashboard?.panels?.length ?? 0) >= 10,
  `dashboard has >= 10 panels (got ${dashboard.dashboard?.panels?.length})`,
);

// --- 4. SLOs ---
section('SLOs (monitoring/slos.yaml)');

const sloPath = resolve(ROOT, 'monitoring/slos.yaml');
assert(existsSync(sloPath), 'slos.yaml exists');

const sloContent = readFileSync(sloPath, 'utf-8');
const sloConfig = jsYaml.load(sloContent) as Record<string, unknown>;
assert(Array.isArray(sloConfig.groups), 'SLO groups is an array');

// --- Summary ---
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('✅ All monitoring config validations passed');
}
