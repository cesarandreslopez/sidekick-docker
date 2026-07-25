/**
 * Encoding for the Services panel's item ids.
 *
 * A row is either a compose project (`project:<name>`) or one of its services
 * (`service:<project>:<service>`). Project names may themselves contain a
 * colon, so the tail has to be rejoined rather than indexed — which is exactly
 * the detail that got subtly different across the ten places this was parsed
 * by hand.
 */
export type ComposeItemRef =
  | { kind: 'project'; projectName: string }
  | { kind: 'service'; projectName: string; serviceName: string }
  | { kind: 'unknown' };

export function composeProjectId(projectName: string): string {
  return `project:${projectName}`;
}

export function composeServiceId(projectName: string, serviceName: string): string {
  return `service:${projectName}:${serviceName}`;
}

export function parseComposeItemId(itemId: string): ComposeItemRef {
  const parts = itemId.split(':');
  if (parts[0] === 'project') {
    return { kind: 'project', projectName: parts.slice(1).join(':') };
  }
  if (parts[0] === 'service') {
    // project is parts[1]; everything after is the service name.
    return { kind: 'service', projectName: parts[1] ?? '', serviceName: parts.slice(2).join(':') };
  }
  return { kind: 'unknown' };
}

/** The compose project a row belongs to, whether it is a project or a service row. */
export function composeProjectNameOf(itemId: string): string | null {
  const ref = parseComposeItemId(itemId);
  return ref.kind === 'unknown' ? null : ref.projectName;
}
