import type { ContainerInfo } from '../types/container';
import type { ComposeProject, ComposeService } from '../types/compose';
import type { ComposeFileConfig } from './ComposeFileReader';

/**
 * Detects compose projects from container labels.
 * Docker Compose adds `com.docker.compose.project` and
 * `com.docker.compose.service` labels to managed containers.
 *
 * Optionally merges with compose file config to show services
 * that have no running containers (state: 'not_created').
 */
export class ComposeDetector {
  detect(containers: ContainerInfo[], fileConfig?: ComposeFileConfig | null): ComposeProject[] {
    const projectMap = new Map<string, Map<string, ComposeService>>();

    for (const c of containers) {
      if (!c.composeProject || !c.composeService) continue;

      if (!projectMap.has(c.composeProject)) {
        projectMap.set(c.composeProject, new Map());
      }

      const services = projectMap.get(c.composeProject)!;
      services.set(c.composeService, {
        name: c.composeService,
        projectName: c.composeProject,
        containerId: c.id,
        state: c.state === 'running' ? 'running' : c.state as ComposeService['state'],
        image: c.image,
        ports: c.ports
          .filter(p => p.hostPort > 0)
          .map(p => `${p.hostPort}:${p.containerPort}/${p.protocol}`),
      });
    }

    // Merge file-only services: add services from compose file that have no container
    if (fileConfig) {
      const projectName = fileConfig.projectName;
      if (!projectMap.has(projectName)) {
        projectMap.set(projectName, new Map());
      }
      const services = projectMap.get(projectName)!;

      for (const fileSvc of fileConfig.services) {
        if (!services.has(fileSvc.name)) {
          services.set(fileSvc.name, {
            name: fileSvc.name,
            projectName,
            state: 'not_created',
            image: fileSvc.image || (fileSvc.hasBuild ? '<build>' : 'unknown'),
            ports: fileSvc.ports,
          });
        }
      }
    }

    const projects: ComposeProject[] = [];
    for (const [name, services] of projectMap) {
      const serviceList = Array.from(services.values());
      const runningCount = serviceList.filter(s => s.state === 'running').length;

      let status: ComposeProject['status'];
      if (runningCount === serviceList.length) {
        status = 'running';
      } else if (runningCount > 0) {
        status = 'partial';
      } else {
        status = 'stopped';
      }

      projects.push({ name, services: serviceList, status });
    }

    return projects.sort((a, b) => a.name.localeCompare(b.name));
  }
}
