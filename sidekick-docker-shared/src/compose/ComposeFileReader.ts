import { spawn } from 'child_process';

export interface ComposeFileServiceConfig {
  name: string;
  image?: string;
  hasBuild: boolean;
  ports: string[];
}

export interface ComposeFileConfig {
  projectName: string;
  services: ComposeFileServiceConfig[];
}

/**
 * Reads compose file configuration from disk using `docker compose config`.
 * Avoids adding a YAML parser — lets Docker handle interpolation, extends, profiles, etc.
 * Returns null on any failure (no file, invalid YAML, docker compose not installed).
 */
export class ComposeFileReader {
  async readFromDirectory(cwd: string): Promise<ComposeFileConfig | null> {
    try {
      const result = await this.exec(['config', '--format', 'json'], cwd);
      if (result.exitCode !== 0) return null;

      const config = JSON.parse(result.stdout);
      const projectName: string = config.name || '';
      if (!projectName) return null;

      const services: ComposeFileServiceConfig[] = [];
      const svcMap = config.services || {};

      for (const [name, def] of Object.entries<any>(svcMap)) {
        const ports: string[] = [];
        if (def.ports) {
          for (const p of def.ports) {
            if (typeof p === 'string') {
              ports.push(p);
            } else if (p && p.published && p.target) {
              ports.push(`${p.published}:${p.target}/${p.protocol || 'tcp'}`);
            }
          }
        }

        services.push({
          name,
          image: def.image || undefined,
          hasBuild: !!def.build,
          ports,
        });
      }

      return { projectName, services };
    } catch {
      return null;
    }
  }

  private exec(args: string[], cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const proc = spawn('docker', ['compose', ...args], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const stdout: string[] = [];
      const stderr: string[] = [];

      proc.stdout.on('data', (data: Buffer) => stdout.push(data.toString()));
      proc.stderr.on('data', (data: Buffer) => stderr.push(data.toString()));

      proc.on('error', reject);
      proc.on('close', (code) => {
        resolve({
          exitCode: code ?? 1,
          stdout: stdout.join(''),
          stderr: stderr.join(''),
        });
      });
    });
  }
}
