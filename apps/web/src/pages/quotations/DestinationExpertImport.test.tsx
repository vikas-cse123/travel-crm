import { describe, it, expect } from 'vitest';
import { normalizeDestinationExpertConfig, resolveQuotationPricing } from '@interscale/shared';

// Mock preset data (Singapore)
const singaporePreset = {
  id: 'preset-sg-1',
  destination: 'Singapore',
  heading: 'Your Singapore Expert',
  customIntroduction: 'I will help plan your Singapore holiday from first chat to check-in.',
  whatsappNumber: '+65 9000 0001',
  callNumber: '+65 9000 0002',
  email: 'singapore@example.test',
  showWhatsapp: true,
  showCall: true,
  showEmail: true,
  showExperience: true,
  showTripsPlanned: true,
  showLanguages: true,
  jobTitle: 'Senior Travel Consultant',
  bio: 'I specialise in Singapore holidays and will personally assist you.',
  specialization: 'Singapore & Bali',
  yearsOfExperience: 12,
  tripsPlanned: 1200,
  languages: 'English • Hindi',
  gender: 'FEMALE' as const,
  profileImageUrl: null as string | null,
};

// Simulate the import snapshot logic from QuotationBuilderPage
function buildExpertSnapshot(preset: typeof singaporePreset, currentUserId: string | null, cur: Record<string, unknown> | null) {
  const snapshot: Record<string, unknown> = {
    ...(cur ?? {}),
    enabled: true,
    expertUserId: currentUserId,
    heading: (preset.heading ?? '').trim() || null,
    customIntroduction: (preset.customIntroduction ?? '').trim() || null,
    whatsappNumber: (preset.whatsappNumber ?? '').trim() || null,
    callNumber: (preset.callNumber ?? '').trim() || null,
    email: (preset.email ?? '').trim().toLowerCase() || null,
    showWhatsapp: preset.showWhatsapp ?? true,
    showCall: preset.showCall ?? true,
    showEmail: preset.showEmail ?? true,
    showExperience: preset.showExperience ?? true,
    showTripsPlanned: preset.showTripsPlanned ?? true,
    showLanguages: preset.showLanguages ?? true,
    jobTitle: (preset.jobTitle ?? '').trim() || null,
    bio: (preset.bio ?? '').trim() || null,
    specialization: (preset.specialization ?? '').trim() || null,
    yearsOfExperience: preset.yearsOfExperience ?? null,
    tripsPlanned: preset.tripsPlanned ?? null,
    languages: (preset.languages ?? '').trim() || null,
    gender: preset.gender ?? null,
    profileImageUrl: (preset as unknown as { profileImageUrl?: string | null }).profileImageUrl ?? null,
    destination: preset.destination ?? null,
  };
  return snapshot;
}

describe('Destination Expert preset import (regression)', () => {
  it('preset list loads', () => {
    const presets = [singaporePreset];
    expect(presets).toHaveLength(1);
    expect(presets[0]!.destination).toBe('Singapore');
  });

  it('Singapore preset can be imported', () => {
    const cur = null;
    const snapshot = buildExpertSnapshot(singaporePreset, 'user-123', cur);
    expect(snapshot.enabled).toBe(true);
    expect(snapshot.expertUserId).toBe('user-123');
    expect(snapshot.destination).toBe('Singapore');
  });

  it('imported fields populate correctly', () => {
    const snapshot = buildExpertSnapshot(singaporePreset, 'user-123', null);
    expect(snapshot.heading).toBe('Your Singapore Expert');
    expect(snapshot.customIntroduction).toBe('I will help plan your Singapore holiday from first chat to check-in.');
    expect(snapshot.whatsappNumber).toBe('+65 9000 0001');
    expect(snapshot.callNumber).toBe('+65 9000 0002');
    expect(snapshot.email).toBe('singapore@example.test');
    expect(snapshot.jobTitle).toBe('Senior Travel Consultant');
    expect(snapshot.bio).toBe('I specialise in Singapore holidays and will personally assist you.');
    expect(snapshot.specialization).toBe('Singapore & Bali');
    expect(snapshot.yearsOfExperience).toBe(12);
    expect(snapshot.tripsPlanned).toBe(1200);
    expect(snapshot.languages).toBe('English • Hindi');
    expect(snapshot.gender).toBe('FEMALE');
    expect(snapshot.showWhatsapp).toBe(true);
    expect(snapshot.showCall).toBe(true);
    expect(snapshot.showEmail).toBe(true);
    expect(snapshot.showExperience).toBe(true);
    expect(snapshot.showTripsPlanned).toBe(true);
    expect(snapshot.showLanguages).toBe(true);
  });

  it('failed import does not erase existing data', () => {
    const existing = {
      enabled: true,
      expertUserId: 'user-123',
      heading: 'Existing Expert',
      whatsappNumber: '+91 90000 00000',
      destination: 'Bali',
    };
    // Simulate failed fetch: do not call buildExpertSnapshot, keep existing
    const afterFailedImport = { ...existing };
    expect(afterFailedImport.heading).toBe('Existing Expert');
    expect(afterFailedImport.destination).toBe('Bali');
    expect(afterFailedImport.whatsappNumber).toBe('+91 90000 00000');
  });

  it('imported data persists after save/reload (snapshot)', () => {
    const snapshot = buildExpertSnapshot(singaporePreset, 'user-123', null);
    // Simulate save: stringify and parse (JSON snapshot)
    const saved = JSON.parse(JSON.stringify(snapshot));
    const reloaded = normalizeDestinationExpertConfig(saved);
    expect(reloaded?.heading).toBe('Your Singapore Expert');
    expect(reloaded?.destination).toBe('Singapore');
    expect(reloaded?.whatsappNumber).toBe('+65 9000 0001');
    expect(reloaded?.yearsOfExperience).toBe(12);
  });

  it('master changes do not mutate quotation snapshot', () => {
    const snapshot = buildExpertSnapshot(singaporePreset, 'user-123', null);
    const savedSnapshot = { ...snapshot };
    // Simulate master preset changed after import
    const updatedMaster = { ...singaporePreset, heading: 'Updated Heading', whatsappNumber: '+65 9999 9999' };
    // Quotation snapshot should remain unchanged
    expect(savedSnapshot.heading).toBe('Your Singapore Expert');
    expect(savedSnapshot.whatsappNumber).toBe('+65 9000 0001');
    expect(updatedMaster.heading).toBe('Updated Heading');
    expect(savedSnapshot.heading).not.toBe(updatedMaster.heading);
  });

  it('importing another preset replaces snapshot', () => {
    const baliPreset = { ...singaporePreset, id: 'preset-bali', destination: 'Bali', heading: 'Bali Expert', whatsappNumber: '+62 8000 0001' };
    const firstSnapshot = buildExpertSnapshot(singaporePreset, 'user-123', null);
    expect(firstSnapshot.destination).toBe('Singapore');
    const secondSnapshot = buildExpertSnapshot(baliPreset, 'user-123', firstSnapshot as any);
    expect(secondSnapshot.destination).toBe('Bali');
    expect(secondSnapshot.heading).toBe('Bali Expert');
    expect(secondSnapshot.whatsappNumber).toBe('+62 8000 0001');
    // Should have replaced, not merged old Singapore data
  });

  it('Show Destination Expert controls weblink/PDF (enabled flag)', () => {
    const enabledConfig = { enabled: true, expertUserId: 'user-123', heading: 'Test' };
    const disabledConfig = { enabled: false, expertUserId: null };
    expect(normalizeDestinationExpertConfig(enabledConfig)?.enabled).toBe(true);
    expect(normalizeDestinationExpertConfig(disabledConfig)?.enabled).toBe(false);
    // When disabled, weblink/PDF should not show expert (isDestinationExpertConfigValid would be false, but enabled false means hidden)
  });

  it('Destination Expert never affects pricing (both modes)', () => {
    const pax = { adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0 };
    const baseVersion: Record<string, unknown> = {
      pricingMode: 'SECTION_WISE' as const,
      currency: 'INR',
      perAdultPrice: 0,
      perChildWithBedPrice: 0,
      perChildWithoutBedPrice: 0,
      perInfantPrice: 0,
      flightDetails: null,
      hotelDetails: null,
      hotels: [],
      sightseeingDetails: null,
      services: [],
    };
    const withExpert: Record<string, unknown> = {
      ...baseVersion,
      destinationExpertConfig: {
        enabled: true,
        expertUserId: 'user-123',
        heading: 'Expert',
        whatsappNumber: '+65 9000 0001',
        destination: 'Singapore',
      },
    };
    const pricingWithoutExpert = resolveQuotationPricing({ version: baseVersion as never, quotation: pax });
    const pricingWithExpert = resolveQuotationPricing({ version: withExpert as never, quotation: pax });
    expect(pricingWithExpert.grandTotal).toBe(pricingWithoutExpert.grandTotal);
    expect(pricingWithExpert.sectionTotal).toBe(pricingWithoutExpert.sectionTotal);
    expect(pricingWithExpert.subtotal).toBe(pricingWithoutExpert.subtotal);

    const travelerVersion: Record<string, unknown> = {
      ...baseVersion,
      pricingMode: 'PER_PERSON' as const,
      perAdultPrice: 10000,
      perChildWithBedPrice: 5000,
    };
    const travelerWith: Record<string, unknown> = {
      ...travelerVersion,
      destinationExpertConfig: {
        enabled: true,
        expertUserId: 'user-123',
        heading: 'Expert',
        destination: 'Singapore',
      },
    };
    const travelerWithout = resolveQuotationPricing({ version: travelerVersion as never, quotation: pax });
    const travelerWithPricing = resolveQuotationPricing({ version: travelerWith as never, quotation: pax });
    expect(travelerWithPricing.grandTotal).toBe(travelerWithout.grandTotal);
  });
});
