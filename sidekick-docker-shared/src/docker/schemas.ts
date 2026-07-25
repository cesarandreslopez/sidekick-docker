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

/**
 * A container's entry in `NetworkSettings.Networks` from the container
 * listing. This is where network membership actually comes from: the
 * `/networks` list endpoint omits its own Containers map, so deriving
 * attachments from the network listing yielded nothing.
 */
export const ContainerNetworkAttachmentRawSchema = z.object({
  IPAddress: z.string().optional(),
  GlobalIPv6Address: z.string().optional(),
  MacAddress: z.string().optional(),
});
export type ContainerNetworkAttachmentRaw = z.infer<typeof ContainerNetworkAttachmentRawSchema>;

/** One IPAM address pool from the daemon's network listing. */
export const NetworkIpamConfigRawSchema = z.object({
  Subnet: z.string().optional(),
  Gateway: z.string().optional(),
  IPRange: z.string().optional(),
});
export type NetworkIpamConfigRaw = z.infer<typeof NetworkIpamConfigRawSchema>;

/** Validates an image item from the Docker API (Dockerode listImages response). */
export const ImageItemRawSchema = z.object({
  Id: z.string(),
  RepoTags: z.array(z.string()).nullable().optional(),
  Size: z.number().default(0),
  Created: z.number().default(0),
});
export type ImageItemRaw = z.infer<typeof ImageItemRawSchema>;

/** Validates a prune images response from the Docker API. */
export const PruneImagesResponseSchema = z.object({
  SpaceReclaimed: z.number().default(0),
});

/** Validates a prune volumes response from the Docker API. */
export const PruneVolumesResponseSchema = z.object({
  SpaceReclaimed: z.number().default(0),
});

/** Validates a prune networks response from the Docker API. */
export const PruneNetworksResponseSchema = z.object({
  NetworksDeleted: z.array(z.string()).nullable().default([]),
});

/** Validates the Config.Env field from a Docker inspect response. */
export const ContainerInspectEnvSchema = z.object({
  Config: z.object({
    Env: z.array(z.string()).nullable().default([]),
  }),
});

/** Validates a single entry from Docker container changes API (Kind: 0=Modified, 1=Added, 2=Deleted). */
export const ContainerChangeRawSchema = z.object({
  Path: z.string(),
  Kind: z.number(),
});
export const ContainerChangesResponseSchema = z.array(ContainerChangeRawSchema).nullable();

/** Validates a single entry from Docker image history API. */
export const ImageHistoryItemRawSchema = z.object({
  Id: z.string().default('<missing>'),
  Created: z.number().default(0),
  CreatedBy: z.string().default(''),
  Size: z.number().default(0),
  Comment: z.string().default(''),
  Tags: z.array(z.string()).nullable().optional(),
});
export const ImageHistoryResponseSchema = z.array(ImageHistoryItemRawSchema);
