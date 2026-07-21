import { projectRepository } from "@/repositories/project.repository"

// ADR-025 (Worklog V3) — Project.clientId is a required field in
// schema.prisma (not optional), so every project has exactly one client.
// Whenever a Worklog write carries a projectId, the project's client always
// wins over anything the caller sent for clientId — it is never a second,
// independently-editable source of truth. Called after assertWorkspaceReferences
// has already confirmed projectId belongs to the workspace, so the lookup
// here is expected to always resolve.
export async function resolveClientFromProject(workspaceId: string, projectId: string): Promise<string> {
  const project = await projectRepository.findById(projectId, workspaceId)
  return project!.clientId
}

// Applies ADR-025 to a write payload: when projectId is present, the
// returned clientId is always the project's own client, discarding whatever
// the caller sent. When projectId is absent, the caller's clientId (if any)
// passes through unchanged — the standalone "no project, but I know the
// client" path stays available.
export async function resolveWorklogContext(
  workspaceId: string,
  projectId: string | undefined,
  clientId: string | undefined,
): Promise<{ clientId: string | undefined }> {
  if (!projectId) return { clientId }
  return { clientId: await resolveClientFromProject(workspaceId, projectId) }
}
