import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer, { MulterError } from 'multer';
import { requireAuth, requireVerifiedEmail } from '../../../middleware/authenticate.js';
import { asyncHandler } from '../../../utils/async-handler.js';
import { ValidationError } from '../../../utils/errors.js';
import { excelImportController } from './excel-import.controller.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream',
    ];
    // Also allow by extension
    if (file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls') || allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx files are allowed.'));
    }
  },
});

/**
 * Multer rejects oversized or non-Excel uploads before the controller runs, and
 * its errors are plain `Error`s that the terminal handler would otherwise turn
 * into a 500. Translate them into a client-safe 400 so the UI can show them.
 */
function uploadSingle(field: string) {
  const handler = upload.single(field);
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, (err?: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
        next(new ValidationError('File too large. Maximum 5MB.'));
        return;
      }
      next(new ValidationError(err instanceof Error ? err.message : 'Invalid file upload.'));
    });
  };
}

router.use(requireAuth, requireVerifiedEmail);

router.get('/template/:masterType', asyncHandler(excelImportController.template));
router.post('/preview', uploadSingle('file'), asyncHandler(excelImportController.preview));
router.post('/execute', uploadSingle('file'), asyncHandler(excelImportController.execute));
router.post('/error-report', uploadSingle('file'), asyncHandler(excelImportController.errorReport));

export { router as excelImportRoutes };
