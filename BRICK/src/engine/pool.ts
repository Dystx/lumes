import { Worker } from 'worker_threads';
import { cpus } from 'os';
import { fileURLToPath } from 'url';
import type { FileScanResult, ResolvedConfig } from '../types';

export interface WorkerPoolOptions {
  threadCount?: number;
  workerScript?: string;
  config: ResolvedConfig;
}

const MAX_RETRIES = 1;

export class WorkerPool {
  private workerScript: string;
  private config: ResolvedConfig;
  private threadCount: number;

  constructor(options: WorkerPoolOptions) {
    this.config = options.config;
    const requested = options.threadCount ?? Math.max(1, cpus().length - 1);
    if (requested <= 0) throw new Error('threadCount must be > 0');
    this.threadCount = requested;
    this.workerScript = options.workerScript ?? fileURLToPath(new URL('./worker.js', import.meta.url));
  }

  async scan(filePaths: string[]): Promise<FileScanResult[]> {
    if (filePaths.length === 0) return [];
    const results: FileScanResult[] = [];
    const seen = new Set<string>();
    const batches: string[][] = Array.from({ length: this.threadCount }, () => []);
    for (let i = 0; i < filePaths.length; i++) {
      batches[i % this.threadCount].push(filePaths[i]);
    }

    await Promise.all(batches.map((batch) => this.runWorker(batch, results, seen)));
    return results;
  }

  private runWorker(batch: string[], results: FileScanResult[], seen: Set<string>): Promise<void> {
    return new Promise((res, rej) => {
      let retries = 0;
      let settled = false;
      let currentWorker: Worker | undefined;

      const spawn = () => {
        const worker = new Worker(this.workerScript, {
          workerData: { filePaths: batch, config: this.config },
        });
        currentWorker = worker;

        worker.on('message', (msg: FileScanResult) => {
          if (!seen.has(msg.filePath)) {
            seen.add(msg.filePath);
            results.push(msg);
          }
        });

        worker.on('error', (err) => {
          console.error('Worker error:', err);
          worker.terminate().catch(() => {});
          if (settled) return;
          if (retries < MAX_RETRIES) {
            retries++;
            spawn();
          } else {
            settled = true;
            rej(err);
          }
        });

        worker.on('exit', (code) => {
          if (worker !== currentWorker || settled) return;
          if (code === 0) {
            settled = true;
            res();
          } else {
            console.error(`Worker exited with code ${code}`);
            if (retries >= MAX_RETRIES) {
              settled = true;
              rej(new Error(`Worker exited with code ${code}`));
            }
          }
        });
      };

      spawn();
    });
  }
}
