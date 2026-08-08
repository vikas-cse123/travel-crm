import { Router } from 'express';
import {
  PERMISSIONS,
  companyBankAccountSchema,
  customDomainCreateSchema,
  logoUploadRequestSchema,
  settingsBrandingSchema,
  settingsDefaultTermsSchema,
  settingsPreferencesSchema,
  settingsProfileSchema,
  settingsTaxSchema,
} from '@interscale/shared';
import { requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { settingsController as c } from './settings.controller.js';

const router = Router();
router.use(requireAuth, requireVerifiedEmail);

const view = requirePermission(PERMISSIONS.SETTINGS_VIEW);
const update = requirePermission(PERMISSIONS.SETTINGS_UPDATE);

router.get('/', view, asyncHandler(c.get));
router.patch(
  '/profile',
  update,
  validateRequest({ body: settingsProfileSchema }),
  asyncHandler(c.updateProfile),
);
router.patch(
  '/branding',
  update,
  validateRequest({ body: settingsBrandingSchema }),
  asyncHandler(c.updateBranding),
);
router.patch(
  '/tax',
  update,
  validateRequest({ body: settingsTaxSchema }),
  asyncHandler(c.updateTax),
);
router.patch(
  '/preferences',
  update,
  validateRequest({ body: settingsPreferencesSchema }),
  asyncHandler(c.updatePreferences),
);
router.patch(
  '/default-terms',
  update,
  validateRequest({ body: settingsDefaultTermsSchema }),
  asyncHandler(c.updateDefaultTerms),
);
router.get('/bank-account', view, asyncHandler(c.getBankAccount));
router.put(
  '/bank-account',
  update,
  validateRequest({ body: companyBankAccountSchema }),
  asyncHandler(c.putBankAccount),
);
router.post(
  '/logo/upload',
  update,
  validateRequest({ body: logoUploadRequestSchema }),
  asyncHandler(c.requestLogoUpload),
);
router.post('/logo/confirm', update, asyncHandler(c.confirmLogo));
router.get('/logo/url', view, asyncHandler(c.logoUrl));
router.delete('/logo', update, asyncHandler(c.deleteLogo));

// Phase 3 Custom Domain — Company Settings administrators/owners only.
router.get('/custom-domain', view, asyncHandler(c.getCustomDomain));
router.post(
  '/custom-domain',
  update,
  validateRequest({ body: customDomainCreateSchema }),
  asyncHandler(c.createCustomDomain),
);
router.post('/custom-domain/check', update, asyncHandler(c.checkCustomDomain));
router.post('/custom-domain/disable', update, asyncHandler(c.disableCustomDomain));

export { router as settingsRoutes };
