import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface TestResult {
  id: string;
  title: string;
  file: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  requirements: string[];
  skipReason?: string;
  error?: {
    message: string;
    stack?: string;
  };
}

export interface RunResults {
  runId: string;
  target: string;
  specVersion?: string;
  baseUrl: string;
  capabilities: string[];
  summary: {
    passed: number;
    failed: number;
    skipped: number;
    durationMs: number;
  };
  tests: TestResult[];
}

export class JsonReporter {
  private results: TestResult[] = [];
  private startTime = Date.now();

  constructor(
    private outDir: string,
    private meta: {
      runId: string;
      target: string;
      baseUrl: string;
      specVersion?: string;
      capabilities: string[];
    }
  ) {}

  onTestFinished(test: any) {
    const status = test.result?.state === 'pass' ? 'passed'
      : test.result?.state === 'fail' ? 'failed'
      : 'skipped';

    const entry: TestResult = {
      id: `${test.suite?.name}#${test.name}`,
      title: test.name,
      file: test.file?.filepath || 'unknown',
      status,
      durationMs: test.result?.duration ?? 0,
      requirements: [], // Would need to be extracted from test metadata
      skipReason: status === 'skipped' ? test.result?.errors?.[0]?.message : undefined,
      error: test.result?.errors?.[0] ? {
        message: test.result.errors[0].message,
        stack: test.result.errors[0].stack,
      } : undefined,
    };

    this.results.push(entry);
  }

  async onFinished() {
    const passed = this.results.filter(r => r.status === 'passed').length;
    const failed = this.results.filter(r => r.status === 'failed').length;
    const skipped = this.results.filter(r => r.status === 'skipped').length;

    const payload: RunResults = {
      runId: this.meta.runId,
      target: this.meta.target,
      specVersion: this.meta.specVersion,
      baseUrl: this.meta.baseUrl,
      capabilities: this.meta.capabilities,
      summary: {
        passed,
        failed,
        skipped,
        durationMs: Date.now() - this.startTime,
      },
      tests: this.results,
    };

    const file = join(this.outDir, 'results.json');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
  }
}

export async function writeRunResultsFromJUnit(options: {
  junitPath: string;
  outDir: string;
  meta: {
    runId: string;
    target: string;
    baseUrl: string;
    specVersion?: string;
    capabilities: string[];
  };
}): Promise<RunResults> {
  const xml = await readFile(options.junitPath, 'utf8');
  const tests = parseTestCases(xml);

  const summary = tests.reduce(
    (acc, test) => {
      acc[test.status] += 1;
      acc.durationMs += test.durationMs;
      return acc;
    },
    {
      passed: 0,
      failed: 0,
      skipped: 0,
      durationMs: 0,
    }
  );

  const payload: RunResults = {
    runId: options.meta.runId,
    target: options.meta.target,
    specVersion: options.meta.specVersion,
    baseUrl: options.meta.baseUrl,
    capabilities: options.meta.capabilities,
    summary,
    tests,
  };

  const file = join(options.outDir, 'results.json');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(payload, null, 2), 'utf8');

  return payload;
}

function parseTestCases(xml: string): TestResult[] {
  const tests: TestResult[] = [];
  const testcaseRegex = /<testcase\b([^>]*)\s*(?:\/>|>([\s\S]*?)<\/testcase>)/g;
  let match: RegExpExecArray | null;

  while ((match = testcaseRegex.exec(xml)) !== null) {
    const attrs = parseAttributes(match[1] ?? '');
    const body = match[2] ?? '';

    const failureMatch = body.match(/<failure\b([^>]*)>([\s\S]*?)<\/failure>/);
    const skippedMatch = body.match(/<skipped\b([^>]*)(?:\/>|>([\s\S]*?)<\/skipped>)/);

    let status: TestResult['status'] = 'passed';
    if (failureMatch) {
      status = 'failed';
    } else if (skippedMatch) {
      status = 'skipped';
    }

    const durationMs = parseDuration(attrs.time);
    const idBase = attrs.classname || attrs.name || `test-${tests.length + 1}`;

    const test: TestResult = {
      id: `${idBase}#${attrs.name ?? tests.length + 1}`,
      title: decodeHtml(attrs.name ?? 'Unnamed Test'),
      file: attrs.classname ?? attrs.file ?? 'unknown',
      status,
      durationMs,
      requirements: [],
    };

    if (failureMatch) {
      const failureAttrs = parseAttributes(failureMatch[1] ?? '');
      const failureText = cleanFailureText(failureMatch[2]);
      const decodedFailure = decodeHtml(failureText);
      const rawMessage = failureAttrs.message ?? (decodedFailure || 'Test failed');
      test.error = {
        // Decode attributes and fallback text consistently for clearer reports.
        message: decodeHtml(rawMessage),
        stack: decodedFailure || undefined,
      };
    }

    if (skippedMatch) {
      const skippedAttrs = parseAttributes(skippedMatch[1] ?? '');
      const reason = skippedAttrs.message ?? cleanFailureText(skippedMatch[2]);
      if (reason) {
        test.skipReason = decodeHtml(reason);
      }
    }

    tests.push(test);
  }

  return tests;
}

function parseAttributes(fragment: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(fragment)) !== null) {
    const [, key, doubleQuoted, singleQuoted] = match;
    attrs[key] = doubleQuoted ?? singleQuoted ?? '';
  }

  return attrs;
}

function parseDuration(value?: string): number {
  if (!value) {
    return 0;
  }
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.round(parsed * 1000);
}

function decodeHtml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&');
}

function cleanFailureText(text?: string): string {
  if (!text) {
    return '';
  }

  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}
