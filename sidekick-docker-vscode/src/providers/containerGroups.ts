import type { ContainerInfo } from 'sidekick-docker-shared';
import { canStop } from 'sidekick-docker-shared';

/**
 * Pure grouping logic for the container tree view.
 * State groups (Running/Stopped/Other) sub-group compose-managed containers
 * by project; containers without a compose project stay direct children.
 */

export interface ComposeProjectGroup {
  /** Stable tree id, e.g. "group-running/proj:myapp". */
  id: string;
  projectName: string;
  containers: ContainerInfo[];
}

export interface ContainerGroup {
  /** Stable tree id: 'group-running' | 'group-stopped' | 'group-other'. */
  id: 'group-running' | 'group-stopped' | 'group-other';
  label: 'Running' | 'Stopped' | 'Other';
  /** Total containers in this group (compose + loose). */
  count: number;
  composeProjects: ComposeProjectGroup[];
  /** Containers without a compose project. */
  containers: ContainerInfo[];
}

const GROUP_DEFS = [
  { id: 'group-running', label: 'Running' },
  { id: 'group-stopped', label: 'Stopped' },
  { id: 'group-other', label: 'Other' },
] as const;

function stateGroupOf(container: ContainerInfo): 'group-running' | 'group-stopped' | 'group-other' {
  if (container.state === 'running') return 'group-running';
  if (container.state === 'exited') return 'group-stopped';
  return 'group-other';
}

export function buildContainerGroups(containers: ContainerInfo[]): ContainerGroup[] {
  const groups: ContainerGroup[] = [];

  for (const def of GROUP_DEFS) {
    const members = containers.filter(c => stateGroupOf(c) === def.id);
    if (members.length === 0) continue;

    const byProject = new Map<string, ContainerInfo[]>();
    const loose: ContainerInfo[] = [];
    for (const c of members) {
      if (c.composeProject) {
        const list = byProject.get(c.composeProject) ?? [];
        list.push(c);
        byProject.set(c.composeProject, list);
      } else {
        loose.push(c);
      }
    }

    const composeProjects: ComposeProjectGroup[] = [...byProject.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([projectName, projectContainers]) => ({
        id: `${def.id}/proj:${projectName}`,
        projectName,
        containers: projectContainers,
      }));

    groups.push({
      id: def.id,
      label: def.label,
      count: members.length,
      composeProjects,
      containers: loose,
    });
  }

  return groups;
}

/**
 * Tree contextValue for a compose project group, so its menu can offer Down
 * and Restart only where something is live (Up is always offered). "Running"
 * means any container with a process — paused or restarting too: an
 * all-paused project still needs Down.
 */
export function composeGroupContextValue(project: ComposeProjectGroup): 'compose-project-group-running' | 'compose-project-group-stopped' {
  return project.containers.some(c => canStop(c.state)) ? 'compose-project-group-running' : 'compose-project-group-stopped';
}

/** What the group's context menu actually offers, given its state and workspace trust. */
export function composeGroupTooltip(project: ComposeProjectGroup, trusted: boolean): string {
  const base = `Compose project ${project.projectName}`;
  if (!trusted) return `${base} — compose actions are disabled until this workspace is trusted`;
  return composeGroupContextValue(project) === 'compose-project-group-running'
    ? `${base} — right-click for Up, Down, Restart`
    : `${base} — right-click for Up`;
}
