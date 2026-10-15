import { invoke } from '@tauri-apps/api/core';

export type Project = {
  id: string;
  name: string;
  description: string;
  created: string;
  updated: string;
};
export type ObjectNode = {
  id: string;
  kind: 'host' | 'service' | 'custom';
  label: string;
  x: number;
  y: number;
  attrs: Record<string, unknown>;
};
export type Relation = {
  id: string;
  source: string;
  target: string;
  kind: string;
  evidence: string | null;
};
export type Scan = {
  id: string;
  target: string;
  status: string;
  command: string[];
  started: string;
  ended: string | null;
  exit_code: string | null;
  output?: string;
  error: string;
};
export type Event = { id: string; message: string; created: string };
export type Detail = {
  project: Project;
  nodes: ObjectNode[];
  edges: Relation[];
  scans: Scan[];
  events: Event[];
};
export type Tool = { name: string; installed: boolean; path: string | null; version?: string };
type Connection = { port: number; token: string };
let connection: Promise<Connection> | undefined;

export function connect() {
  connection ??= invoke<Connection>('backend_connection');
  return connection;
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const c = await connect();
  const response = await fetch('http://127.0.0.1:' + c.port + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + c.token,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: 'Local API request failed (' + response.status + ')' }));
    throw new Error(
      typeof error.detail === 'string' ? error.detail : 'Invalid input. Check your values.',
    );
  }
  return response.json();
}
export async function downloadArtifact(id: string) {
  const c = await connect();
  const r = await fetch('http://127.0.0.1:' + c.port + '/scans/' + id + '/artifact', {
    headers: { Authorization: 'Bearer ' + c.token },
  });
  if (!r.ok) throw new Error('Evidence is unavailable');
  return r.text();
}
export async function saveArtifact(id: string) {
  const content = await downloadArtifact(id);
  try {
    return await invoke<string>('export_xml', { scanId: id, content });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}
