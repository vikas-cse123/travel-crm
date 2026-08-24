import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { destinationExpertPresetsService } from './destination-expert-presets.service.js';

const router = Router();

const presetSchema = z.object({
  destination: z.string().trim().min(2).max(120),
  heading: z.string().trim().max(200).nullable().optional(),
  customIntroduction: z.string().trim().max(2000).nullable().optional(),
  whatsappNumber: z
    .string()
    .trim()
    .max(32)
    .nullable()
    .optional()
    .refine((v) => !v || /^\+?[0-9\s()\-]{6,32}$/.test(v), 'Enter a valid WhatsApp number'),
  callNumber: z
    .string()
    .trim()
    .max(32)
    .nullable()
    .optional()
    .refine((v) => !v || /^\+?[0-9\s()\-]{6,32}$/.test(v), 'Enter a valid phone number'),
  email: z
    .string()
    .trim()
    .max(255)
    .nullable()
    .optional()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address'),
  showWhatsapp: z.boolean().optional(),
  showCall: z.boolean().optional(),
  showEmail: z.boolean().optional(),
  showExperience: z.boolean().optional(),
  showTripsPlanned: z.boolean().optional(),
  showLanguages: z.boolean().optional(),
  jobTitle: z.string().trim().max(120).nullable().optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  specialization: z.string().trim().max(200).nullable().optional(),
  yearsOfExperience: z.coerce.number().int().min(0).max(100).nullable().optional(),
  tripsPlanned: z.coerce.number().int().min(0).max(1000000).nullable().optional(),
  languages: z.string().trim().max(200).nullable().optional(),
  gender: z.enum(['MALE', 'FEMALE']).nullable().optional(),
});

const idParam = z.object({ id: z.string().uuid() });

// All presets are user-level, no extra permission – any verified user can manage own presets
router.use(requireAuth, requireVerifiedEmail);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await destinationExpertPresetsService.list(req.auth!);
    res.json({ success: true, data });
  }),
);

router.get(
  '/:id',
  validateRequest({ params: idParam }),
  asyncHandler(async (req, res) => {
    const data = await destinationExpertPresetsService.get(req.auth!, req.params.id as string);
    res.json({ success: true, data });
  }),
);

router.post(
  '/',
  validateRequest({ body: presetSchema }),
  asyncHandler(async (req, res) => {
    const data = await destinationExpertPresetsService.create(req.auth!, req.body);
    res.status(201).json({ success: true, data });
  }),
);

router.patch(
  '/:id',
  validateRequest({ params: idParam, body: presetSchema.partial() }),
  asyncHandler(async (req, res) => {
    const data = await destinationExpertPresetsService.update(req.auth!, req.params.id as string, req.body);
    res.json({ success: true, data });
  }),
);

router.delete(
  '/:id',
  validateRequest({ params: idParam }),
  asyncHandler(async (req, res) => {
    const data = await destinationExpertPresetsService.remove(req.auth!, req.params.id as string);
    res.json({ success: true, data });
  }),
);

export { router as destinationExpertPresetsRoutes };
