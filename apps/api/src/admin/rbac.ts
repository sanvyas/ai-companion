// Who may do what in the admin portal. Roles are small on purpose: this is a founder's tool, not an enterprise IAM.
export type Role = 'owner' | 'engineer' | 'support' | 'viewer';
export const ROLES: Role[] = ['owner', 'engineer', 'support', 'viewer'];

export type Permission =
  | 'overview.read' | 'users.read' | 'users.write' | 'cost.read' | 'cost.write' | 'analytics.read'
  | 'infra.read' | 'infra.write' | 'audit.read' | 'flags.read' | 'flags.write' | 'settings.write'
  | 'prompts.read' | 'prompts.write' | 'prompts.publish' | 'prompts.publish_safety'
  | 'integrations.read' | 'integrations.write' | 'safety.read' | 'safety.review'
  | 'content.read' | 'content.write' | 'dev.read' | 'dev.deploy' | 'dev.deploy_prod' | 'admins.manage' | 'users.invite' | 'changes.read';

const VIEWER: Permission[] = ['overview.read', 'users.read', 'cost.read', 'analytics.read', 'infra.read', 'flags.read', 'prompts.read', 'integrations.read', 'safety.read', 'content.read', 'dev.read', 'changes.read'];
const SUPPORT: Permission[] = [...VIEWER, 'users.write', 'safety.review', 'content.write'];
const ENGINEER: Permission[] = [...VIEWER, 'flags.write', 'settings.write', 'prompts.write', 'infra.write', 'content.write', 'dev.deploy'];
const OWNER: Permission[] = [...new Set<Permission>([...SUPPORT, ...ENGINEER, 'cost.write', 'audit.read', 'prompts.publish', 'prompts.publish_safety', 'integrations.write', 'dev.deploy_prod', 'admins.manage', 'users.invite'])];

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  viewer: new Set(VIEWER), support: new Set(SUPPORT), engineer: new Set([...ENGINEER, 'prompts.publish']), owner: new Set(OWNER),
};

/** Seniority for approvals: a change must be approved by someone strictly above whoever asked for it. */
export const TIER: Record<Role, number> = { viewer: 0, support: 1, engineer: 2, owner: 3 };
export const isHigher = (a: Role, b: Role) => TIER[a] > TIER[b];

export const can = (role: Role, p: Permission) => MATRIX[role].has(p);
export const permissionsOf = (role: Role): Permission[] => [...MATRIX[role]];
