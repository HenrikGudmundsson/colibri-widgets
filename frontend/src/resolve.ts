// Mirrors agent_backend/api/models.py's ResolveRequest/ResolveResponse --
// keep these in sync with that file if the backend's shape changes.
export type ResolveRequest = {
  query: string
  session_id: string
  // Capability names this app has widgets for; the backend offers the
  // model only these.
  tools: string[]
}

export type ResolveResponse = {
  tool: string | null
  args: Record<string, unknown> | null
  reply: string | null
  // Names why the question was refused rather than answered, when it was;
  // `reply` then holds the explanation.
  limited?: string | null
}

// Typed tool-call shape, mirrored from apps/ssr-agent/app/agent.ts -- kept
// in sync with that file and with agent_backend's actual two capabilities.
export type ToolCall =
  | { tool: 'showWeather'; args: { location: string } }
  | { tool: 'showCalendar'; args: { week_offset: number } }
  | { tool: 'showTodo'; args: { add: string[] } }

// The shape of the function that asks the agent. `resolve` below is the
// real one; App takes it as a prop so a caller can supply another (a
// test double, a different transport).
export type ResolveFn = (request: ResolveRequest) => Promise<ResolveResponse>

// Always same-origin, relative -- nginx proxies this in branch deploys
// (deploy/nginx.branch.conf), Vite's dev server proxies it locally
// (vite.config.ts), so this file never needs to know the backend's real
// address in either environment.
export async function resolve(request: ResolveRequest): Promise<ResolveResponse> {
  const response = await fetch('/agent-tools-api/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    throw new Error(`resolve failed: ${response.status}`)
  }
  return response.json() as Promise<ResolveResponse>
}
