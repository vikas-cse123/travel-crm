import { useState } from 'react';
import { Info } from 'lucide-react';
import type { HotelMonthPrice, HotelSeason } from '@/features/masters/masters.api';
import { fieldClass, CurrencySelect } from './MasterUi';
import {
  HotelRatesEditor,
  type MonthRateDraft,
  type SeasonRateDraft,
} from './HotelRatesEditor';

const PRICING_INFO_TEXT =
  'Base price is used when no monthly or seasonal rate applies. ' +
  'Monthly rates apply to a selected calendar month. ' +
  'Seasonal rates apply to a specific date range. ' +
  'Quotation/web/PDF pricing integration will be added separately.';

/** Compact hover tooltip (info icon) used beside the Hotel Pricing heading. */
function InfoTip({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Info
        aria-label={label}
        className="h-4 w-4 cursor-help text-slate-400 transition-colors hover:text-slate-600"
      />
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-50 mt-2 w-80 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-700 shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}

export interface HotelPricingDrafts {
  monthRates: MonthRateDraft[];
  seasonRates: SeasonRateDraft[];
}

interface HotelPricingSectionProps {
  basePrice: string;
  onBasePriceChange: (value: string) => void;
  baseCurrency: string;
  onBaseCurrencyChange: (value: string) => void;
  /** Present when editing an existing hotel; rates are persisted via the API. */
  hotelId?: string;
  existingMonthPrices?: HotelMonthPrice[];
  existingSeasons?: HotelSeason[];
  /** Emits month/season drafts in create mode (hotel not yet created). */
  onDraftsChange?: (drafts: HotelPricingDrafts) => void;
}

const toMonthDraft = (rows: HotelMonthPrice[] | undefined): MonthRateDraft[] =>
  (rows ?? []).map((row) => ({
    id: row.id,
    month: String(row.month),
    price: row.price == null ? '' : String(row.price),
    currency: row.currency,
  }));

const toSeasonDraft = (rows: HotelSeason[] | undefined): SeasonRateDraft[] =>
  (rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    startDate: row.startDate.slice(0, 10),
    endDate: row.endDate.slice(0, 10),
    price: row.price == null ? '' : String(row.price),
    currency: row.currency,
  }));

/**
 * "Hotel Pricing": the base rate plus optional monthly and seasonal rates.
 * Used on the Hotel form; on Create the month/season rows are collected as
 * drafts and persisted after the hotel is created, on Edit they are managed
 * directly against the hotel pricing APIs.
 */
export function HotelPricingSection({
  basePrice,
  onBasePriceChange,
  baseCurrency,
  onBaseCurrencyChange,
  hotelId,
  existingMonthPrices,
  existingSeasons,
  onDraftsChange,
}: HotelPricingSectionProps) {
  const editMode = Boolean(hotelId);
  const [monthDrafts, setMonthDrafts] = useState<MonthRateDraft[]>([]);
  const [seasonDrafts, setSeasonDrafts] = useState<SeasonRateDraft[]>([]);
  const monthRates = editMode ? toMonthDraft(existingMonthPrices) : monthDrafts;
  const seasonRates = editMode ? toSeasonDraft(existingSeasons) : seasonDrafts;

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b bg-slate-50 px-5 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-slate-800">Hotel Pricing</h3>
          <InfoTip text={PRICING_INFO_TEXT} label="Hotel pricing information" />
        </div>
      </div>
      <div className="space-y-4 p-5">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Base Price
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={0.01}
                className={`${fieldClass} mt-0 min-w-0 flex-1`}
                placeholder="e.g. 40000"
                aria-label="Hotel price"
                value={basePrice}
                onChange={(event) => onBasePriceChange(event.target.value)}
              />
              <CurrencySelect
                value={baseCurrency}
                onChange={onBaseCurrencyChange}
                aria-label="Hotel price currency"
              />
            </div>
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Used when no monthly or seasonal rate applies.
          </p>
        </div>

        {hotelId ? (
          <HotelRatesEditor
            entityKind="hotel"
            hotelId={hotelId}
            ownerId={hotelId}
            monthRates={monthRates}
            seasonRates={seasonRates}
          />
        ) : (
          <HotelRatesEditor
            entityKind="hotel"
            monthRates={monthRates}
            seasonRates={seasonRates}
            onMonthRatesChange={(rows) => {
              setMonthDrafts(rows);
              onDraftsChange?.({ monthRates: rows, seasonRates: seasonDrafts });
            }}
            onSeasonRatesChange={(rows) => {
              setSeasonDrafts(rows);
              onDraftsChange?.({ monthRates: monthDrafts, seasonRates: rows });
            }}
          />
        )}
      </div>
    </section>
  );
}