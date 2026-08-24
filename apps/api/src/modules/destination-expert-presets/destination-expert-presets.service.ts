import { prisma } from '../../config/prisma.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';

export interface DestinationExpertPresetInput {
  destination: string;
  heading?: string | null;
  customIntroduction?: string | null;
  whatsappNumber?: string | null;
  callNumber?: string | null;
  email?: string | null;
  showWhatsapp?: boolean;
  showCall?: boolean;
  showEmail?: boolean;
  showExperience?: boolean;
  showTripsPlanned?: boolean;
  showLanguages?: boolean;
  jobTitle?: string | null;
  bio?: string | null;
  specialization?: string | null;
  yearsOfExperience?: number | null;
  tripsPlanned?: number | null;
  languages?: string | null;
  gender?: 'MALE' | 'FEMALE' | null;
}

export const destinationExpertPresetsService = {
  async list(auth: AuthContext) {
    return prisma.destinationExpertPreset.findMany({
      where: { companyId: auth.companyId, userId: auth.userId },
      orderBy: [{ destination: 'asc' }, { createdAt: 'asc' }],
    });
  },

  async create(auth: AuthContext, input: DestinationExpertPresetInput) {
    const destination = input.destination.trim();
    if (!destination) throw new ConflictError('Destination is required.');
    const existing = await prisma.destinationExpertPreset.findFirst({
      where: { userId: auth.userId, destination },
    });
    if (existing) throw new ConflictError('A preset for this destination already exists.');

    return prisma.destinationExpertPreset.create({
      data: {
        companyId: auth.companyId,
        userId: auth.userId,
        destination,
        heading: input.heading?.trim() || null,
        customIntroduction: input.customIntroduction?.trim() || null,
        whatsappNumber: input.whatsappNumber?.trim() || null,
        callNumber: input.callNumber?.trim() || null,
        email: input.email?.trim().toLowerCase() || null,
        showWhatsapp: input.showWhatsapp ?? true,
        showCall: input.showCall ?? true,
        showEmail: input.showEmail ?? true,
        showExperience: input.showExperience ?? true,
        showTripsPlanned: input.showTripsPlanned ?? true,
        showLanguages: input.showLanguages ?? true,
        jobTitle: input.jobTitle?.trim() || null,
        bio: input.bio?.trim() || null,
        specialization: input.specialization?.trim() || null,
        yearsOfExperience: input.yearsOfExperience ?? null,
        tripsPlanned: input.tripsPlanned ?? null,
        languages: input.languages?.trim() || null,
        gender: input.gender ?? null,
      },
    });
  },

  async update(auth: AuthContext, id: string, input: DestinationExpertPresetInput) {
    const existing = await prisma.destinationExpertPreset.findFirst({
      where: { id, companyId: auth.companyId, userId: auth.userId },
    });
    if (!existing) throw new NotFoundError('Preset not found.');

    // If destination changed, ensure uniqueness
    if (input.destination && input.destination.trim() !== existing.destination) {
      const dup = await prisma.destinationExpertPreset.findFirst({
        where: { userId: auth.userId, destination: input.destination.trim(), id: { not: id } },
      });
      if (dup) throw new ConflictError('A preset for this destination already exists.');
    }

    return prisma.destinationExpertPreset.update({
      where: { id },
      data: {
        ...(input.destination !== undefined ? { destination: input.destination.trim() } : {}),
        ...(input.heading !== undefined ? { heading: input.heading?.trim() || null } : {}),
        ...(input.customIntroduction !== undefined ? { customIntroduction: input.customIntroduction?.trim() || null } : {}),
        ...(input.whatsappNumber !== undefined ? { whatsappNumber: input.whatsappNumber?.trim() || null } : {}),
        ...(input.callNumber !== undefined ? { callNumber: input.callNumber?.trim() || null } : {}),
        ...(input.email !== undefined ? { email: input.email?.trim().toLowerCase() || null } : {}),
        ...(input.showWhatsapp !== undefined ? { showWhatsapp: input.showWhatsapp } : {}),
        ...(input.showCall !== undefined ? { showCall: input.showCall } : {}),
        ...(input.showEmail !== undefined ? { showEmail: input.showEmail } : {}),
        ...(input.showExperience !== undefined ? { showExperience: input.showExperience } : {}),
        ...(input.showTripsPlanned !== undefined ? { showTripsPlanned: input.showTripsPlanned } : {}),
        ...(input.showLanguages !== undefined ? { showLanguages: input.showLanguages } : {}),
        ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle?.trim() || null } : {}),
        ...(input.bio !== undefined ? { bio: input.bio?.trim() || null } : {}),
        ...(input.specialization !== undefined ? { specialization: input.specialization?.trim() || null } : {}),
        ...(input.yearsOfExperience !== undefined ? { yearsOfExperience: input.yearsOfExperience } : {}),
        ...(input.tripsPlanned !== undefined ? { tripsPlanned: input.tripsPlanned } : {}),
        ...(input.languages !== undefined ? { languages: input.languages?.trim() || null } : {}),
        ...(input.gender !== undefined ? { gender: input.gender } : {}),
      },
    });
  },

  async get(auth: AuthContext, id: string) {
    const preset = await prisma.destinationExpertPreset.findFirst({
      where: { id, companyId: auth.companyId, userId: auth.userId },
    });
    if (!preset) throw new NotFoundError('Preset not found.');
    return preset;
  },

  async remove(auth: AuthContext, id: string) {
    const existing = await prisma.destinationExpertPreset.findFirst({
      where: { id, companyId: auth.companyId, userId: auth.userId },
    });
    if (!existing) throw new NotFoundError('Preset not found.');
    await prisma.destinationExpertPreset.delete({ where: { id } });
    return { deleted: true };
  },
};
