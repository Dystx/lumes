import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  getGitHead,
  getGitRoot,
  getStagedFiles,
  getFileEditCount,
  getFileLastModifiedDate,
} from '../src/git';

const createTmpDir = () => realpathSync(mkdtempSync(join(tmpdir(), 'slop-audit-git-test-')));

const git = (cwd: string, ...args: string[]): void => {
  execFileSync('git', args, { cwd, encoding: 'utf-8' });
};

const gitCommitAt = (cwd: string, message: string, date: string): void => {
  execFileSync('git', ['commit', '-m', message], {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    },
  });
};

describe('git helpers', () => {
  let repo: string;

  beforeEach(() => {
    repo = createTmpDir();
    git(repo, 'init');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Test User');
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  describe('getGitRoot', () => {
    it('returns the repo root inside a git repository', () => {
      expect(getGitRoot(repo)).toBe(repo);
    });

    it('returns undefined outside a git repository', () => {
      expect(getGitRoot(tmpdir())).toBeUndefined();
    });

    it('returns the root from a nested directory', () => {
      const nested = join(repo, 'packages', 'app');
      mkdirSync(nested, { recursive: true });
      expect(getGitRoot(nested)).toBe(repo);
    });
  });

  describe('getGitHead', () => {
    it('returns undefined when there are no commits', async () => {
      expect(await getGitHead(repo)).toBeUndefined();
    });

    it('returns the current commit hash', async () => {
      writeFileSync(join(repo, 'file.txt'), 'hello');
      git(repo, 'add', 'file.txt');
      git(repo, 'commit', '-m', 'initial');
      const head = await getGitHead(repo);
      expect(head).toMatch(/^[a-f0-9]{40}$/);
    });

    it('returns undefined outside a git repository', async () => {
      expect(await getGitHead(tmpdir())).toBeUndefined();
    });
  });

  describe('getStagedFiles', () => {
    it('returns an empty array when there are no staged files', async () => {
      expect(await getStagedFiles(repo)).toEqual([]);
    });

    it('returns staged file paths', async () => {
      mkdirSync(join(repo, 'src'), { recursive: true });
      writeFileSync(join(repo, 'src', 'Button.tsx'), 'export const Button = () => {};');
      git(repo, 'add', 'src/Button.tsx');
      expect(await getStagedFiles(repo)).toEqual(['src/Button.tsx']);
    });

    it('returns an empty array outside a git repository', async () => {
      expect(await getStagedFiles(tmpdir())).toEqual([]);
    });
  });

  describe('getFileEditCount', () => {
    it('returns the number of edits in the requested window', async () => {
      const file = join(repo, 'counter.ts');
      writeFileSync(file, 'let n = 0;');
      git(repo, 'add', 'counter.ts');
      gitCommitAt(repo, 'first', '2026-06-12T00:00:00Z');

      writeFileSync(file, 'let n = 1;');
      git(repo, 'add', 'counter.ts');
      gitCommitAt(repo, 'second', '2026-06-14T00:00:00Z');

      expect(await getFileEditCount(repo, 'counter.ts', 30)).toBe(2);
    });

    it('returns 0 outside a git repository', async () => {
      expect(await getFileEditCount(tmpdir(), 'counter.ts', 30)).toBe(0);
    });
  });

  describe('getFileLastModifiedDate', () => {
    it('returns the last commit date for the file', async () => {
      const file = join(repo, 'dated.ts');
      writeFileSync(file, 'export const value = 1;');
      git(repo, 'add', 'dated.ts');
      gitCommitAt(repo, 'initial', '2026-05-01T12:00:00Z');

      const date = await getFileLastModifiedDate(repo, 'dated.ts');
      expect(date).toBeInstanceOf(Date);
      expect(date?.toISOString()).toBe('2026-05-01T12:00:00.000Z');
    });

    it('returns undefined when there are no commits', async () => {
      expect(await getFileLastModifiedDate(repo, 'missing.ts')).toBeUndefined();
    });

    it('returns undefined outside a git repository', async () => {
      expect(await getFileLastModifiedDate(tmpdir(), 'missing.ts')).toBeUndefined();
    });
  });
});
