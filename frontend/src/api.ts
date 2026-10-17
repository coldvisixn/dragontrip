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
  kind: 'host' | 'service' | 'custom' | 'url' | 'domain' | 'application' | 'endpoint';
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
export type Profile = {
  scripts?: string[];
  id: string;
  name: string;
  tool: string;
  ports: string;
  rate: number;
  timeout: number;
};
export type ScanRequest = {
  target: string;
  profile: string;
  authorized: boolean;
  confirmed: boolean;
  words: string[];
  service_node?: string;
};
export type Scan = {
  tool?: string;
  profile?: string;
  options?: Profile;
  id: string;
  target: string;
  status: string;
  command: string[];
  started: string;
  queued_at?: string;
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
    throw new ApiError(response.status, error.detail);
  }
  return response.json();
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(
      typeof detail === 'string'
        ? detail
        : (detail as { message?: string })?.message || 'Invalid input. Check your values.',
    );
  }
}
export async function uploadFile<T>(
  path: string,
  file: File,
  fields: Record<string, string> = {},
): Promise<T> {
  const c = await connect();
  const body = new FormData();
  body.append('file', file);
  for (const [name, value] of Object.entries(fields)) body.append(name, value);
  const response = await fetch(`http://127.0.0.1:${c.port}${path}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + c.token },
    body,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'File operation failed' }));
    throw new Error(typeof error.detail === 'string' ? error.detail : 'Invalid file');
  }
  return response.json();
}
export async function fetchEvidence(pid: string, id: string): Promise<Blob> {
  const c = await connect();
  const response = await fetch(
    `http://127.0.0.1:${c.port}/projects/${pid}/attachments/${id}/content`,
    { headers: { Authorization: 'Bearer ' + c.token } },
  );
  if (!response.ok) throw new Error('Evidence is unavailable or its integrity check failed');
  return response.blob();
}
export async function downloadArtifact(id: string) {
  const c = await connect();
  const r = await fetch('http://127.0.0.1:' + c.port + '/scans/' + id + '/artifact', {
    headers: { Authorization: 'Bearer ' + c.token },
  });
  if (!r.ok) throw new Error('Evidence is unavailable');
  return r.text();
}
export async function saveArtifact(id: string, format: 'xml' | 'json' = 'xml') {
  let content = await downloadArtifact(id);
  if (format === 'json') {
    try {
      JSON.parse(content);
    } catch {
      content = JSON.stringify(
        content
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => JSON.parse(line)),
        null,
        2,
      );
    }
  }
  try {
    return await invoke<string>(format === 'xml' ? 'export_xml' : 'export_json', {
      scanId: id,
      content,
    });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error), { cause: error });
  }
}
