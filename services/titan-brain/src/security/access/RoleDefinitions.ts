export enum Permission {
  // Trading
  EXECUTE_TRADE = 'trade:execute',
  VIEW_MARKET_DATA = 'market:view',
  CANCEL_ORDERS = 'trade:cancel',

  // Risk
  VIEW_RISK_METRICS = 'risk:view',
  UPDATE_RISK_POLICY = 'risk:update',
  RESET_CIRCUIT_BREAKER = 'risk:breaker:reset',

  // System
  VIEW_SYSTEM_STATUS = 'system:view',
  MANAGE_SECRETS = 'system:secrets',
  ADMIN_OVERRIDE = 'system:override',
}

export enum Role {
  SUPERADMIN = 'superadmin',
  OPERATOR = 'operator',
  RISK_MANAGER = 'risk_manager',
  TRADER = 'trader',
  VIEWER = 'viewer',
}

export const RolePermissions: Record<Role, Permission[]> = {
  [Role.SUPERADMIN]: Object.values(Permission), // All permissions

  [Role.OPERATOR]: [
    Permission.EXECUTE_TRADE,
    Permission.VIEW_MARKET_DATA,
    Permission.CANCEL_ORDERS,
    Permission.VIEW_RISK_METRICS,
    Permission.VIEW_SYSTEM_STATUS,
    Permission.RESET_CIRCUIT_BREAKER,
    Permission.ADMIN_OVERRIDE,
  ],

  [Role.RISK_MANAGER]: [
    Permission.VIEW_MARKET_DATA,
    Permission.VIEW_RISK_METRICS,
    Permission.UPDATE_RISK_POLICY,
    Permission.RESET_CIRCUIT_BREAKER,
    Permission.VIEW_SYSTEM_STATUS,
  ],

  [Role.TRADER]: [
    Permission.EXECUTE_TRADE,
    Permission.VIEW_MARKET_DATA,
    Permission.CANCEL_ORDERS,
    Permission.VIEW_RISK_METRICS,
    Permission.VIEW_SYSTEM_STATUS,
  ],

  [Role.VIEWER]: [
    Permission.VIEW_MARKET_DATA,
    Permission.VIEW_RISK_METRICS,
    Permission.VIEW_SYSTEM_STATUS,
  ],
};

export function getPermissionsForRole(role: Role | string): Permission[] {
  return RolePermissions[role as Role] || [];
}
