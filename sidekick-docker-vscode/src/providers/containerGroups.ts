import type { ContainerInfo, ContainerStateGroup } from 'sidekick-docker-shared';
import { canStop, containerStateGroup } from 'sidekick-docker-shared';

/**
 * Pure grouping logic for the container tree view.
 * State groups (Running/Stopped/Other) sub-group compose-managed containers
 * by project; containers without a compose project stay direct children.
 */

export interface ComposeProjectGroup {
  /** Stable tree id, e.g. "group-running/proj:myapp". */
  id: string;
  projectName: string;
  /** This project's containers in this state group. */
  containers: ContainerInfo[];
  /**
   * Whether any of the project's containers — in any state group — has a
   * process (running, paused or restarting). The Stopped group's entry for a
   * half-up project used to offer only Up, though Down and Restart apply.
   */
  live: boolean;
}

export interface ContainerGroup {
  /** Stable tree id: 'group-running' | 'group-stopped' | 'group-other'. */
  id: 'group-running' | 'group-stopped' | 'group-other';
  label: ContainerStateGroup;
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

/**
 * The shared grouping, as in the dashboard: "Running" is what the
 * running-only toggle keeps (paused and restarting too), "Stopped" is exited
 * or dead.
 */
function stateGroupOf(container: ContainerInfo): ContainerStateGroup {
  return containerStateGroup(container.state);
}

export function buildContainerGroups(containers: ContainerInfo[]): ContainerGroup[] {
  const groups: ContainerGroup[] = [];

  const liveProjects = new Set<string>();
  for (const c of containers) {
    if (c.composeProject && canStop(c.state)) liveProjects.add(c.composeProject);
  }

  for (const def of GROUP_DEFS) {
    const members = containers.filter(c => stateGroupOf(c) === def.label);
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
        live: liveProjects.has(projectName),
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
 * and Restart only where something is live (Up is always offered). "Live" is
 * judged across the whole project, not just this state group's slice of it.
 */
export function composeGroupContextValue(project: ComposeProjectGroup): 'compose-project-group-running' | 'compose-project-group-stopped' {
  return project.live ? 'compose-project-group-running' : 'compose-project-group-stopped';
}

/** What the group's context menu actually offers, given its state and workspace trust. */
export function composeGroupTooltip(project: ComposeProjectGroup, trusted: boolean): string {
  const base = `Compose project ${project.projectName}`;
  if (!trusted) return `${base} — compose actions are disabled until this workspace is trusted`;
  return composeGroupContextValue(project) === 'compose-project-group-running'
    ? `${base} — right-click for Up, Down, Restart`
    : `${base} — right-click for Up`;
}
