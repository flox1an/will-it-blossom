import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';

const WaitConfigSchema = z.object({
  http: z.object({
    path: z.string(),
    status: z.number(),
    timeoutMs: z.number(),
  }),
});

const VolumeSchema = z.object({
  type: z.literal('temp'),
  target: z.string(),
});

const DockerStartSchema = z.object({
  type: z.literal('docker'),
  image: z.string(),
  platform: z.string().optional(),
  env: z.record(z.string()).optional(),
  ports: z.array(z.string()).optional(),
  volumes: z.array(VolumeSchema).optional(),
  wait: WaitConfigSchema,
});

const DockerComposeStartSchema = z.object({
  type: z.literal('docker-compose'),
  file: z.string(),
  project: z.string(),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  wait: WaitConfigSchema,
});

const ProcessStartSchema = z.object({
  type: z.literal('process'),
  command: z.string(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  wait: WaitConfigSchema,
});

const ServerConfigSchema = z.object({
  name: z.string(),
  start: z.union([DockerStartSchema, DockerComposeStartSchema, ProcessStartSchema]),
  baseUrl: z.string(),
  specVersion: z.string().optional(),
  capabilities: z.array(z.string()).optional().default([]),
  limits: z.record(z.unknown()).optional(),
  secrets: z.record(z.unknown()).optional(),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type DockerStart = z.infer<typeof DockerStartSchema>;
export type DockerComposeStart = z.infer<typeof DockerComposeStartSchema>;
export type ProcessStart = z.infer<typeof ProcessStartSchema>;

const RootConfigSchema = z.object({
  defaultTarget: z.string().optional(),
  targets: z.array(z.object({
    name: z.string(),
    config: z.string(),
  })),
});

export type RootConfig = z.infer<typeof RootConfigSchema>;

export async function loadServerConfig(path: string): Promise<ServerConfig> {
  const content = await readFile(path, 'utf-8');
  const data = parse(content);
  return ServerConfigSchema.parse(data);
}

export async function loadRootConfig(path: string = '.blossomrc.yml'): Promise<RootConfig> {
  const content = await readFile(path, 'utf-8');
  const data = parse(content);
  return RootConfigSchema.parse(data);
}
