import { SetMetadata } from '@nestjs/common';
import type { AdminRole } from '@prisma/client';

import { ROLES_META_KEY } from '../guards/roles.guard';

/**
 * Declare which non-ADMIN roles can access a handler. Super ADMIN always
 * passes regardless of this list. Use alongside `@UseGuards(AdminOnlyGuard, RolesGuard)`.
 *
 * Example: `@RequireRoles('CATALOG_MANAGER', 'VIEWER')`
 */
export const RequireRoles = (...roles: AdminRole[]) =>
  SetMetadata(ROLES_META_KEY, roles);
