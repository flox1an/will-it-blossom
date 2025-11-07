import { writeFile, mkdir } from 'node:fs/promises';
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
