import type { Request, Response } from 'express';
import { SUPPORTED_IMPORT_TYPES } from './excel-import.types.js';
import { generateTemplate, fileNameForType } from './template.service.js';
import { previewImport, executeImport, generateErrorReport } from './excel-import.service.js';
import { getAdapter } from './adapters/index.js';
import { permissionsService } from '../../auth/permissions.service.js';
import { UnauthorizedError, ForbiddenError, ValidationError } from '../../../utils/errors.js';

const auth = (req: Request) => {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
};

const context = (req: Request) => ({
  ipAddress: req.ip ?? null,
  userAgent: req.get('user-agent') ?? null,
});

export const excelImportController = {
  async template(req: Request, res: Response) {
    const masterType = String(req.params.masterType ?? '').toUpperCase();
    if (!SUPPORTED_IMPORT_TYPES.includes(masterType as never)) throw new ValidationError('Unsupported master type for import.');
    const adapter = getAdapter(masterType);
    const hasPermission = await permissionsService.userHasPermission(auth(req).userId, adapter.permission);
    if (!hasPermission) throw new ForbiddenError();

    const buffer = await generateTemplate(masterType as never);
    const fileName = fileNameForType(masterType as never);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  },

  async preview(req: Request, res: Response) {
    const masterType = String(req.body.masterType ?? req.query.masterType ?? '').toUpperCase();
    if (!SUPPORTED_IMPORT_TYPES.includes(masterType as never)) throw new ValidationError('masterType is required and must be one of: ' + SUPPORTED_IMPORT_TYPES.join(', '));
    const adapter = getAdapter(masterType);
    const hasPermission = await permissionsService.userHasPermission(auth(req).userId, adapter.permission);
    if (!hasPermission) throw new ForbiddenError();

    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) throw new ValidationError('Excel file is required.');

    if (file.size > 5 * 1024 * 1024) throw new ValidationError('File too large. Maximum 5MB.');

    const result = await previewImport(file.buffer, masterType as never, auth(req));
    res.json({ success: true, data: result });
  },

  async execute(req: Request, res: Response) {
    const masterType = String(req.body.masterType ?? '').toUpperCase();
    if (!SUPPORTED_IMPORT_TYPES.includes(masterType as never)) throw new ValidationError('masterType is required.');
    const adapter = getAdapter(masterType);
    const hasPermission = await permissionsService.userHasPermission(auth(req).userId, adapter.permission);
    if (!hasPermission) throw new ForbiddenError();

    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) throw new ValidationError('Excel file is required.');

    const result = await executeImport(file.buffer, masterType as never, auth(req), context(req));
    // A fatal (row 0) error means nothing was written and the user should retry.
    if (result.createdCount === 0 && result.errors?.some((e) => e.row === 0)) {
      res.status(400).json({ success: false, error: { message: result.errors.find((e) => e.row === 0)!.message } });
      return;
    }
    const message =
      result.skippedCount > 0
        ? `Imported ${result.createdCount} records. ${result.skippedCount} rows skipped due to errors.`
        : `Imported ${result.createdCount} records.`;
    res.json({ success: true, data: result, message });
  },

  async errorReport(req: Request, res: Response) {
    const masterType = String(req.body.masterType ?? '').toUpperCase();
    if (!SUPPORTED_IMPORT_TYPES.includes(masterType as never)) throw new ValidationError('masterType is required.');
    const adapter = getAdapter(masterType);
    const hasPermission = await permissionsService.userHasPermission(auth(req).userId, adapter.permission);
    if (!hasPermission) throw new ForbiddenError();

    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) throw new ValidationError('Excel file is required.');

    const preview = await previewImport(file.buffer, masterType as never, auth(req));
    const buffer = await generateErrorReport(preview);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${masterType}_error_report.xlsx"`);
    res.send(buffer);
  },
};
