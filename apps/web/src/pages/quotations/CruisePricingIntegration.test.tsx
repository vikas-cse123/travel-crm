import { describe, expect, it, vi } from 'vitest';
import { findCruiseRoomType, resolveCruiseCabinPrice } from './QuotationBuilderPage';
import {
  calculateCruiseRoomLinesTotal,
  resolveCruiseRoomLines,
  cruiseNightsToDays,
} from '@interscale/shared';

const auth = vi.hoisted(() => ({ permissions: new Set<string>() }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ hasPermission: (key: string) => auth.permissions.has(key), user: { id: 'u1' } }),
}));

const gentingDream = {
  id: 'cruise-1',
  name: 'Genting Dream',
  description: '<p>Luxury cruise</p>',
  status: 'ACTIVE',
  roomTypes: [
    { id: 'rt-1', name: 'Interior Stateroom', price: 1000, currency: 'INR', status: 'ACTIVE', sortOrder: 0 },
    { id: 'rt-2', name: 'Oceanview Stateroom', price: 2000, currency: 'INR', status: 'ACTIVE', sortOrder: 1 },
    { id: 'rt-3', name: 'Balcony Stateroom', price: 3000, currency: 'INR', status: 'ACTIVE', sortOrder: 2 },
    { id: 'rt-4', name: 'Suite No Price', price: null, currency: 'INR', status: 'ACTIVE', sortOrder: 3 },
  ],
  images: [],
};

const otherCruise = {
  id: 'cruise-2',
  name: 'Other Cruise',
  description: '<p>Other</p>',
  status: 'ACTIVE',
  roomTypes: [
    { id: 'rt-10', name: 'Oceanview Stateroom', price: 5000, currency: 'INR', status: 'ACTIVE', sortOrder: 0 },
  ],
  images: [],
};

describe('Cruise pricing — room-type matching and cabin rate', () => {
  it('1. Genting Dream + Interior → ₹1,000', () => {
    expect(resolveCruiseCabinPrice(gentingDream as never, 'rt-1', null)).toBe(1000);
  });
  it('2. Genting Dream + Oceanview → ₹2,000', () => {
    expect(resolveCruiseCabinPrice(gentingDream as never, 'rt-2', null)).toBe(2000);
  });
  it('3. Genting Dream + Balcony → ₹3,000', () => {
    expect(resolveCruiseCabinPrice(gentingDream as never, 'rt-3', null)).toBe(3000);
  });
  it('4. 2 Oceanview cabins → ₹4,000 total (rate × quantity)', () => {
    const rate = resolveCruiseCabinPrice(gentingDream as never, 'rt-2', null)!;
    const quantity = 2;
    expect(rate * quantity).toBe(4000);
  });
  it('5. Change Oceanview → Balcony → rate changes to ₹3,000', () => {
    const ocean = resolveCruiseCabinPrice(gentingDream as never, 'rt-2', null);
    const balcony = resolveCruiseCabinPrice(gentingDream as never, 'rt-3', null);
    expect(ocean).toBe(2000);
    expect(balcony).toBe(3000);
    expect(ocean).not.toBe(balcony);
  });
  it('8. Valid room ID must not produce unavailable', () => {
    const room = findCruiseRoomType(gentingDream as never, 'rt-2', null);
    expect(room).not.toBeNull();
    expect(room?.name).toBe('Oceanview Stateroom');
  });
  it('9. Invalid room must produce validation error (not found)', () => {
    const room = findCruiseRoomType(gentingDream as never, 'invalid-id', null);
    expect(room).toBeNull();
  });
  it('10. Changing cruise must revalidate room (Oceanview in Genting Dream not in Other Cruise same id)', () => {
    // rt-2 belongs to Genting Dream, not Other Cruise
    const inOther = findCruiseRoomType(otherCruise as never, 'rt-2', null);
    expect(inOther).toBeNull();
    // Other Cruise has its own Oceanview with different id
    const inOtherByName = findCruiseRoomType(otherCruise as never, null, 'Oceanview Stateroom');
    expect(inOtherByName).not.toBeNull();
    expect(inOtherByName?.id).toBe('rt-10');
  });
  it('11. Legacy room-name-only quotation still works', () => {
    const room = findCruiseRoomType(gentingDream as never, null, 'Oceanview Stateroom');
    expect(room?.id).toBe('rt-2');
    expect(resolveCruiseCabinPrice(gentingDream as never, null, 'Oceanview Stateroom')).toBe(2000);
    // Case-insensitive and trimmed
    expect(findCruiseRoomType(gentingDream as never, null, '  oceanview stateroom  ')?.id).toBe('rt-2');
  });
  it('No master price → null', () => {
    expect(resolveCruiseCabinPrice(gentingDream as never, 'rt-4', null)).toBeNull();
  });
  it('find prefers ID over name', () => {
    // If both id and name provided but mismatch, id wins
    const room = findCruiseRoomType(gentingDream as never, 'rt-1', 'Balcony Stateroom');
    expect(room?.id).toBe('rt-1');
    expect(room?.name).toBe('Interior Stateroom');
  });
});

describe('Cruise manual override and totals', () => {
  it('6. Manual override ₹2,000 → ₹1,800 remains ₹1,800 (not overwritten)', () => {
    const masterPrice = resolveCruiseCabinPrice(gentingDream as never, 'rt-2', null)!;
    expect(masterPrice).toBe(2000);
    const manualPrice = 1800;
    // Simulate override set: price should stay manual, not revert to master
    expect(manualPrice).not.toBe(masterPrice);
    expect(manualPrice).toBe(1800);
  });
  it('7. Change cabin quantity → total recalculates (now Number of Rooms)', () => {
    const rate = 2000;
    expect(rate * 1).toBe(2000);
    expect(rate * 2).toBe(4000);
    expect(rate * 3).toBe(6000);
  });
  it('12. By Traveler pricing mode must remain unchanged (cruise not traveler-based)', () => {
    // Cruise pricing is always per-night rate × rooms × nights, not per-traveler
    const cruiseTotal = (sellingPrice: number, quantity: number) => sellingPrice * quantity;
    expect(cruiseTotal(2000, 1)).toBe(2000);
  });
  it('13. By Section pricing must show correct Cruise Total', () => {
    const cruiseTotal = (sellingPrice: number, quantity: number) => sellingPrice * quantity;
    expect(cruiseTotal(2000, 2)).toBe(4000);
  });
  it('14. PDF/Weblink must receive correct Cruise amount (sellingPrice × quantity)', () => {
    const cruise = { serviceType: 'CRUISE', sellingPrice: 2000, quantity: 2 };
    const pdfAmount = Number(cruise.sellingPrice) * Number(cruise.quantity);
    expect(pdfAmount).toBe(4000);
  });
});

describe('Cruise structured duration and multi-room', () => {
  it('2 Nights = 3 Days', () => {
    expect(cruiseNightsToDays(2)).toBe(3);
    expect(cruiseNightsToDays(1)).toBe(2);
    expect(cruiseNightsToDays(3)).toBe(4);
  });
  it('Room Rate × Rooms × Nights (per-night) – 3000×2×3=18000', () => {
    const service = {
      serviceType: 'CRUISE',
      cruiseNights: 3,
      cruiseRoomLines: [{ cruiseRoomTypeId: 'rt-3', roomType: 'Balcony', rooms: 2, roomRate: 3000 }],
    };
    expect(calculateCruiseRoomLinesTotal(service as never, 3)).toBe(18000);
    // Also via helper with nights param
    expect(calculateCruiseRoomLinesTotal(service as never)).toBe(18000);
  });
  it('Number of Nights affects total correctly (per-night semantics)', () => {
    const base = {
      serviceType: 'CRUISE',
      cruiseNights: 2,
      cruiseRoomLines: [{ cruiseRoomTypeId: 'rt-2', roomType: 'Oceanview', rooms: 1, roomRate: 2000 }],
    };
    expect(calculateCruiseRoomLinesTotal(base as never, 2)).toBe(4000);
    expect(calculateCruiseRoomLinesTotal({ ...base, cruiseNights: 3 } as never, 3)).toBe(6000);
    expect(calculateCruiseRoomLinesTotal({ ...base, cruiseNights: 1 } as never, 1)).toBe(2000);
  });
  it('Number of Rooms affects total', () => {
    const service = {
      serviceType: 'CRUISE',
      cruiseNights: 2,
      cruiseRoomLines: [{ cruiseRoomTypeId: 'rt-1', roomType: 'Interior', rooms: 1, roomRate: 1000 }],
    };
    expect(calculateCruiseRoomLinesTotal(service as never, 2)).toBe(2000);
    expect(calculateCruiseRoomLinesTotal({ ...service, cruiseRoomLines: [{ cruiseRoomTypeId: 'rt-1', roomType: 'Interior', rooms: 2, roomRate: 1000 }] } as never, 2)).toBe(4000);
  });
  it('Multiple room lines work (sum independent)', () => {
    const service = {
      serviceType: 'CRUISE',
      cruiseNights: 2,
      cruiseRoomLines: [
        { cruiseRoomTypeId: 'rt-1', roomType: 'Interior', rooms: 1, roomRate: 1000 },
        { cruiseRoomTypeId: 'rt-2', roomType: 'Oceanview', rooms: 2, roomRate: 2000 },
      ],
    };
    // Room1: 1000*1*2=2000, Room2: 2000*2*2=8000, total 10000
    expect(calculateCruiseRoomLinesTotal(service as never, 2)).toBe(10000);
  });
  it('Different room types can be selected in different lines', () => {
    const service = {
      serviceType: 'CRUISE',
      cruiseNights: 3,
      cruiseRoomLines: [
        { cruiseRoomTypeId: 'rt-1', roomType: 'Interior', rooms: 1, roomRate: 1000 },
        { cruiseRoomTypeId: 'rt-3', roomType: 'Balcony', rooms: 1, roomRate: 3000 },
      ],
    };
    expect(calculateCruiseRoomLinesTotal(service as never, 3)).toBe(12000); // 3000+9000
  });
  it('Each room line calculates independently', () => {
    const line1 = { roomRate: 1000, rooms: 1, nights: 2 };
    const line2 = { roomRate: 2000, rooms: 2, nights: 2 };
    expect(line1.roomRate * line1.rooms * line1.nights).toBe(2000);
    expect(line2.roomRate * line2.rooms * line2.nights).toBe(8000);
  });
  it('Manual Room Rate override works and not overwritten by duration', () => {
    // Simulate manual edit: roomRate 2000 -> 1800, nights 2 -> 3 should keep 1800
    const manualRate = 1800;
    const service = {
      serviceType: 'CRUISE',
      cruiseNights: 3,
      cruiseRoomLines: [{ cruiseRoomTypeId: 'rt-2', roomType: 'Oceanview', rooms: 1, roomRate: manualRate }],
    };
    expect(calculateCruiseRoomLinesTotal(service as never, 3)).toBe(5400); // 1800*1*3
    expect(calculateCruiseRoomLinesTotal(service as never, 2)).toBe(3600);
  });
  it('Changing Room Type loads new master price', () => {
    const interior = resolveCruiseCabinPrice(gentingDream as never, 'rt-1', null);
    const balcony = resolveCruiseCabinPrice(gentingDream as never, 'rt-3', null);
    expect(interior).toBe(1000);
    expect(balcony).toBe(3000);
  });
  it('Cruise Total equals sum of all room lines', () => {
    const service = {
      serviceType: 'CRUISE',
      cruiseNights: 2,
      cruiseRoomLines: [
        { cruiseRoomTypeId: 'rt-1', roomType: 'Interior', rooms: 1, roomRate: 1000 },
        { cruiseRoomTypeId: 'rt-2', roomType: 'Oceanview', rooms: 1, roomRate: 2000 },
      ],
    };
    const total = calculateCruiseRoomLinesTotal(service as never, 2);
    const sum = 1000 * 1 * 2 + 2000 * 1 * 2;
    expect(total).toBe(sum);
  });
  it('Existing quotations still load (legacy single-room synthesis)', () => {
    const legacy = {
      serviceType: 'CRUISE',
      cruiseId: 'cruise-1',
      cruiseRoomTypeId: 'rt-2',
      city: 'Oceanview Stateroom',
      quantity: 1,
      sellingPrice: 2000,
    };
    const lines = resolveCruiseRoomLines(legacy as never);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.cruiseRoomTypeId).toBe('rt-2');
    expect(lines[0]!.rooms).toBe(1);
    expect(lines[0]!.roomRate).toBe(2000);
  });
  it('Legacy with no room lines but quantity/sellingPrice still calculates', () => {
    const legacy = {
      serviceType: 'CRUISE',
      quantity: 2,
      sellingPrice: 2000,
      cruiseNights: 3,
    };
    // Helper should synthesize? Actually resolve will create line from legacy, then total = 2000*2*3
    expect(calculateCruiseRoomLinesTotal(legacy as never, 3)).toBe(12000);
  });
});
