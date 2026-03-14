import { z } from 'zod';

/**
 * Zod schemas for validating `docker compose config --format json` output.
 */

const ComposePortObjectSchema = z.object({
  published: z.union([z.string(), z.number()]),
  target: z.union([z.string(), z.number()]),
  protocol: z.string().default('tcp'),
});

const ComposePortSchema = z.union([z.string(), ComposePortObjectSchema]);

const ComposeServiceDefSchema = z.object({
  image: z.string().optional(),
  build: z.unknown().optional(),
  ports: z.array(ComposePortSchema).optional(),
});

export const ComposeConfigRawSchema = z.object({
  name: z.string().default(''),
  services: z.record(z.string(), ComposeServiceDefSchema).default({}),
});

export type ComposeConfigRaw = z.infer<typeof ComposeConfigRawSchema>;
