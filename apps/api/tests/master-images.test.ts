import { describe, expect, it } from 'vitest';
import {
  appendMasterImage,
  effectiveMasterImages,
  masterImageWriteData,
  presentMasterImages,
  removeMasterImage,
  reorderMasterImages,
  type LegacyImageFields,
} from '../src/modules/masters/master-images.js';

const confirmedAt = new Date('2026-08-20T10:00:00.000Z');
const legacyImageId = 'legacy-3b6018aedd51ba31de353f9835d1772e';

function legacyRow(overrides: Partial<LegacyImageFields> = {}): LegacyImageFields {
  return {
    images: null,
    imageObjectKey: 'companies/company-a/masters/hotels/hotel-a/images/legacy.jpg',
    imageFileName: 'legacy.jpg',
    imageMimeType: null,
    imageFileSize: null,
    imageConfirmedAt: confirmedAt,
    ...overrides,
  };
}

describe('master image galleries', () => {
  it('keeps sparse legacy single-image rows readable without exposing object keys', () => {
    expect(effectiveMasterImages(legacyRow())).toEqual([
      {
        id: legacyImageId,
        objectKey: 'companies/company-a/masters/hotels/hotel-a/images/legacy.jpg',
        fileName: 'legacy.jpg',
        mimeType: 'image/jpeg',
        fileSize: 0,
        confirmedAt: confirmedAt.toISOString(),
      },
    ]);
    expect(presentMasterImages(legacyRow())).toEqual([
      {
        id: legacyImageId,
        fileName: 'legacy.jpg',
        mimeType: 'image/jpeg',
        fileSize: 0,
        isPrimary: true,
      },
    ]);
    expect(JSON.stringify(presentMasterImages(legacyRow()))).not.toContain('companies/');
  });

  it('appends without replacing the legacy primary image', () => {
    const images = appendMasterImage(
      legacyRow(),
      {
        objectKey: 'companies/company-a/masters/hotels/hotel-a/images/new.webp',
        fileName: 'new.webp',
        mimeType: 'image/webp',
        fileSize: 1234,
      },
      new Date('2026-08-20T11:00:00.000Z'),
    );

    expect(images).toHaveLength(2);
    expect(images.map((image) => image.fileName)).toEqual(['legacy.jpg', 'new.webp']);
    expect(masterImageWriteData(images)).toMatchObject({
      imageObjectKey: 'companies/company-a/masters/hotels/hotel-a/images/legacy.jpg',
      imageFileName: 'legacy.jpg',
      imageConfirmedAt: confirmedAt,
    });
  });

  it('validates complete ordering and removes only the selected gallery entry', () => {
    const images = appendMasterImage(
      legacyRow(),
      {
        objectKey: 'companies/company-a/masters/hotels/hotel-a/images/new.png',
        fileName: 'new.png',
        mimeType: 'image/png',
        fileSize: 456,
      },
      new Date('2026-08-20T12:00:00.000Z'),
    );
    const row = legacyRow({ images });
    const secondId = images[1]!.id;

    expect(reorderMasterImages(row, [secondId, legacyImageId])?.map((image) => image.id)).toEqual([
      secondId,
      legacyImageId,
    ]);
    expect(reorderMasterImages(row, [secondId])).toBeNull();
    expect(reorderMasterImages(row, [secondId, secondId])).toBeNull();

    const removed = removeMasterImage(row, secondId);
    expect(removed?.target.id).toBe(secondId);
    expect(removed?.images.map((image) => image.id)).toEqual([legacyImageId]);
  });

  it('treats a persisted empty gallery as an intentional removal, not a legacy fallback', () => {
    expect(effectiveMasterImages(legacyRow({ images: [] }))).toEqual([]);
  });
});
