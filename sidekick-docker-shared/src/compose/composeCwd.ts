import { existsSync } from 'fs';
import { dirname, resolve } from 'path';

/** The location Docker recorded for a compose project, from its labels. */
export interface ComposeProjectSourceLocation {
  workingDir?: string;
  configFile?: string;
  configFiles?: string[];
}

/**
 * Directory a `docker compose` command for this project should run in.
 *
 * Compose resolves services relative to its working directory, so running from
 * the wrong place either targets the wrong project or fails outright. Prefer
 * the location Docker recorded on the project's containers
 * (`com.docker.compose.project.working_dir` / `.config_files`) — that is
 * correct no matter where the app itself was launched from — and only fall
 * back to the caller's directory when neither label survived.
 *
 * Paths are existence-checked because a project can outlive the directory it
 * was created from (a deleted checkout, a container copied between hosts).
 */
export function resolveComposeCwd(
  source: ComposeProjectSourceLocation | undefined,
  fallback: string | undefined,
): string | undefined {
  const workingDir = source?.workingDir;
  if (workingDir && existsSync(workingDir)) return workingDir;

  const configFile = source?.configFile;
  if (configFile && existsSync(configFile)) return dirname(configFile);

  return fallback;
}

export interface ComposeCommandOptions {
  cwd?: string;
  configFiles?: string[];
}

/** Resolve recorded configuration without silently falling back to another project. */
export function resolveComposeOptions(
  source: ComposeProjectSourceLocation | undefined,
  fallback?: string,
): ComposeCommandOptions {
  const recorded = source?.configFiles?.length ? source.configFiles : source?.configFile ? [source.configFile] : [];
  const configFiles = recorded.map(file => resolve(source?.workingDir ?? fallback ?? process.cwd(), file));
  const missing = configFiles.filter(file => !existsSync(file));
  if (missing.length) throw new Error(`Compose configuration not found: ${missing.join(', ')}. Restore these files before running this action.`);
  if (source?.workingDir && !existsSync(source.workingDir) && !configFiles.length) {
    throw new Error(`Compose project directory not found: ${source.workingDir}`);
  }
  return { cwd: resolveComposeCwd({ ...source, configFile: configFiles[0] }, fallback), configFiles };
}
