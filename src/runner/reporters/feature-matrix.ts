import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { TestResult } from './json-reporter.js';

export async function writeFeatureMatrix(
  outDir: string,
  capabilities: string[],
  tests: TestResult[]
): Promise<void> {
  const capSet = new Set(capabilities);

  // Get unique capabilities from tests
  const allRequiredCaps = new Set<string>();
  for (const test of tests) {
    for (const cap of test.requirements || []) {
      allRequiredCaps.add(cap);
    }
  }

  const rows: string[][] = [
    ['Capability', 'Supported', 'Notes'],
  ];

  // Add rows for each capability
  const sortedCaps = Array.from(allRequiredCaps).sort();
  for (const cap of sortedCaps) {
    const supported = capSet.has(cap);
    rows.push([cap, supported ? '✅' : '❌', '']);
  }

  // Build markdown table
  const md = [
    '# Feature Matrix',
    '',
    `**Target**: ${outDir.split('/').pop()}`,
    `**Capabilities Declared**: ${capabilities.length}`,
    '',
    '| ' + rows[0].join(' | ') + ' |',
    '| ' + rows[0].map(() => '---').join(' | ') + ' |',
    ...rows.slice(1).map(r => '| ' + r.join(' | ') + ' |'),
  ].join('\n');

  const file = join(outDir, 'feature-matrix.md');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, md, 'utf8');
}

export async function writeServerInfo(
  outDir: string,
  info: {
    name: string;
    baseUrl: string;
    image?: string;
    command?: string;
    specVersion?: string;
    capabilities: string[];
    limits?: Record<string, any>;
  }
): Promise<void> {
  const file = join(outDir, 'server-info.json');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(info, null, 2), 'utf8');
}

export async function writeManifest(
  outDir: string,
  manifest: {
    runId: string;
    createdAt: string;
    targets: Array<{ id: string; path: string }>;
  }
): Promise<void> {
  const file = join(outDir, 'manifest.json');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(manifest, null, 2), 'utf8');
}
