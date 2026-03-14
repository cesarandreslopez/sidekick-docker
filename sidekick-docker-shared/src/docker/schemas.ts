import { z } from 'zod';

/**
 * Zod schemas for validating raw Docker API JSON responses.
 * These schemas are intentionally lenient (using defaults and optionals)
 * to handle variations across Docker Engine versions while still
 * providing runtime type safety at the API boundary.
 */

// --- Docker Stats API response ---

const CpuUsageSchema = z.object({
  total_usage: z.number().default(0),
  percpu_usage: z.array(z.number()).optional(),
});

const CpuStatsSchema = z.object({
  cpu_usage: CpuUsageSchema.default({ total_usage: 0 }),
  system_cpu_usage: z.number().default(0),
  online_cpus: z.number().optional(),
});

const MemoryStatsSchema = z.object({
  usage: z.number().default(0),
  limit: z.number().default(0),
});

const NetworkInterfaceStatsSchema = z.object({
  rx_bytes: z.number().default(0),
  tx_bytes: z.number().default(0),
});

const BlkioEntrySchema = z.object({
  op: z.string().default(''),
  value: z.number().default(0),
});

const BlkioStatsSchema = z.object({
  io_service_bytes_recursive: z.array(BlkioEntrySchema).nullable().optional(),
});

const PidsStatsSchema = z.object({
  current: z.number().default(0),
});

export const DockerStatsRawSchema = z.object({
  cpu_stats: CpuStatsSchema.optional(),
  precpu_stats: CpuStatsSchema.optional(),
  memory_stats: MemoryStatsSchema.optional(),
  networks: z.record(z.string(), NetworkInterfaceStatsSchema).optional(),
  pids_stats: PidsStatsSchema.optional(),
  blkio_stats: BlkioStatsSchema.optional(),
});

export type DockerStatsRaw = z.infer<typeof DockerStatsRawSchema>;

// --- Docker Event API response ---

const EventActorSchema = z.object({
  ID: z.string().default(''),
  Attributes: z.record(z.string(), z.string()).default({}),
});

export const DockerEventRawSchema = z.object({
  Type: z.string().default('container'),
  Action: z.string().optional(),
  status: z.string().optional(),
  time: z.number().default(0),
  Actor: EventActorSchema.optional(),
});

export type DockerEventRaw = z.infer<typeof DockerEventRawSchema>;

// --- Dockerode list response field schemas ---

/** Validates container state from Docker API, falling back to 'exited' for unknown values. */
export const ContainerStateSchema = z.enum([
  'running', 'paused', 'restarting', 'exited', 'dead', 'created', 'removing',
]).catch('exited');

/** Validates port protocol from Docker API, falling back to 'tcp' for unknown values. */
export const PortProtocolSchema = z.enum(['tcp', 'udp']).catch('tcp');

/** Validates a volume item from the Docker API (includes CreatedAt not in upstream Dockerode types). */
export const VolumeItemRawSchema = z.object({
  Name: z.string(),
  Driver: z.string(),
  Mountpoint: z.string(),
  CreatedAt: z.string().optional(),
});
export type VolumeItemRaw = z.infer<typeof VolumeItemRawSchema>;

/** Validates a network container reference from the Docker API. */
export const NetworkContainerRefRawSchema = z.object({
  Name: z.string().default(''),
});
export type NetworkContainerRefRaw = z.infer<typeof NetworkContainerRefRawSchema>;
