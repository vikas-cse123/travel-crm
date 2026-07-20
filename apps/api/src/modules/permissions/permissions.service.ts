import { PERMISSION_CATALOG, PERMISSION_MODULE_LABELS } from '@interscale/shared';
import { ConflictError } from '../../utils/errors.js';
import { permissionsRepository } from './permissions.repository.js';

export const permissionCatalogService = {
  async grouped() {
    const rows = await permissionsRepository.listAll();
    const expected = new Map(PERMISSION_CATALOG.map((p) => [p.key, p]));
    if (
      rows.length !== expected.size ||
      rows.some((r) => expected.get(r.key)?.isAvailable !== r.isAvailable)
    )
      throw new ConflictError('Permission catalog drift detected. Run the database seed.');
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = groups.get(row.module) ?? [];
      list.push(row);
      groups.set(row.module, list);
    }
    return [...groups].map(([module, permissions]) => ({
      module,
      label: PERMISSION_MODULE_LABELS[module as keyof typeof PERMISSION_MODULE_LABELS] ?? module,
      permissions,
    }));
  },
};
