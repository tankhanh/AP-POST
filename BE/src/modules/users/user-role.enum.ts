export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  STAFF = 'STAFF',
  SHIPPER = 'SHIPPER',
}

export const MANAGED_USER_ROLES = [UserRole.STAFF, UserRole.SHIPPER] as const;
