import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import path from 'node:path';
import type {Logger} from '../app/logger.js';

const execFileAsync = promisify(execFile);

export interface TodoCandidate {
  filePath: string;
  line: number;
  text: string;
  ageInDays?: number;
}

export interface ImportCleanupCandidate {
  filePath: string;
  message: string;
}

export class CodebaseService {
  constructor(
    private readonly monorepoPath: string,
    private readonly logger: Logger
  ) {}

  async searchLiteralInPaths(
    literal: string,
    searchPaths: string[]
  ): Promise<string[]> {
    if (searchPaths.length === 0) {
      return [];
    }

    try {
      const args = [
        '-F',
        '-l',
        '--no-messages',
        literal,
        '--',
        ...searchPaths.map((targetPath) =>
          path.isAbsolute(targetPath)
            ? targetPath
            : path.join(this.monorepoPath, targetPath)
        ),
      ];
      const {stdout} = await execFileAsync('rg', args, {
        cwd: this.monorepoPath,
        timeout: 15000,
      });
      return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((absolutePath) => path.relative(this.monorepoPath, absolutePath));
    } catch {
      return [];
    }
  }

  async findTodos(paths: string[]): Promise<TodoCandidate[]> {
    if (paths.length === 0) {
      return [];
    }

    try {
      const args = ['-n', '--no-messages', 'TODO|FIXME', '--', ...paths];
      const {stdout} = await execFileAsync('rg', args, {
        cwd: this.monorepoPath,
        timeout: 15000,
      });
      const matches = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 20);

      const candidates = await Promise.all(
        matches.map(async (line) => {
          const [filePath, lineNumber, ...rest] = line.split(':');
          const ageInDays = await this.getBlameAge(
            filePath,
            Number(lineNumber)
          );
          return {
            filePath,
            line: Number(lineNumber),
            text: rest.join(':').trim(),
            ageInDays,
          } satisfies TodoCandidate;
        })
      );

      return candidates
        .filter((candidate) => (candidate.ageInDays ?? 0) >= 180)
        .sort((left, right) => (right.ageInDays ?? 0) - (left.ageInDays ?? 0))
        .slice(0, 3);
    } catch (error) {
      this.logger.warn('Unable to search TODO and FIXME comments.', error);
      return [];
    }
  }

  async findUnusedImportCandidates(
    paths: string[]
  ): Promise<ImportCleanupCandidate[]> {
    if (paths.length === 0) {
      return [];
    }

    const files = await this.listFiles(paths, [
      '*.ts',
      '*.tsx',
      '*.js',
      '*.jsx',
    ]);
    if (files.length === 0) {
      return [];
    }

    try {
      const {stdout} = await execFileAsync(
        'npx',
        ['eslint', '--format', 'json', ...files.slice(0, 15)],
        {
          cwd: this.monorepoPath,
          timeout: 30000,
        }
      );
      const results = JSON.parse(stdout) as Array<{
        filePath: string;
        messages: Array<{ruleId: string | null; message: string}>;
      }>;

      return results
        .flatMap((result) =>
          result.messages
            .filter(
              (message) =>
                (message.ruleId ?? '').includes('unused') ||
                message.message.toLowerCase().includes('never used')
            )
            .map((message) => ({
              filePath: path.relative(this.monorepoPath, result.filePath),
              message: message.message,
            }))
        )
        .slice(0, 3);
    } catch (error) {
      this.logger.warn(
        'Unused import detection failed. Continuing without those task candidates.',
        error
      );
      return [];
    }
  }

  async listFiles(
    paths: string[],
    extensions: string[] = []
  ): Promise<string[]> {
    try {
      const {stdout} = await execFileAsync(
        'git',
        ['-C', this.monorepoPath, 'ls-files', '--', ...paths],
        {
          timeout: 15000,
        }
      );
      return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((filePath) =>
          extensions.length === 0
            ? true
            : extensions.some((pattern) =>
                filePath.endsWith(pattern.replace('*', ''))
              )
        );
    } catch {
      return [];
    }
  }

  private async getBlameAge(
    filePath: string,
    lineNumber: number
  ): Promise<number | undefined> {
    try {
      const {stdout} = await execFileAsync(
        'git',
        [
          '-C',
          this.monorepoPath,
          'blame',
          '--porcelain',
          '-L',
          `${lineNumber},${lineNumber}`,
          '--',
          filePath,
        ],
        {
          timeout: 10000,
        }
      );
      const authorTimeLine = stdout
        .split('\n')
        .find((line) => line.startsWith('author-time '));
      if (!authorTimeLine) {
        return undefined;
      }
      const timestamp = Number(authorTimeLine.replace('author-time ', ''));
      const ageMs = Date.now() - timestamp * 1000;
      return Math.floor(ageMs / (1000 * 60 * 60 * 24));
    } catch {
      return undefined;
    }
  }
}
