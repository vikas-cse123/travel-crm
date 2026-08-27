import type { ImportAdapter } from '../excel-import.types.js';
import { cityAdapter } from './city.adapter.js';
import { airlineAdapter } from './airline.adapter.js';
import { cruiseAdapter } from './cruise.adapter.js';
import { vehicleAdapter } from './vehicle.adapter.js';
import { addOnServiceAdapter } from './add-on-service.adapter.js';
import { destinationAdapter } from './destination.adapter.js';
import { sightseeingAdapter } from './sightseeing.adapter.js';
import type { SupportedImportType } from '../excel-import.types.js';

export const adapters: Record<SupportedImportType, ImportAdapter> = {
  CITY: cityAdapter,
  AIRLINE: airlineAdapter,
  CRUISE: cruiseAdapter,
  VEHICLE: vehicleAdapter,
  ADD_ON_SERVICE: addOnServiceAdapter,
  DESTINATION: destinationAdapter,
  SIGHTSEEING: sightseeingAdapter,
};

export function getAdapter(type: string): ImportAdapter {
  const upper = type.toUpperCase() as SupportedImportType;
  const adapter = adapters[upper];
  if (!adapter) throw new Error(`Unsupported import type: ${type}`);
  return adapter;
}

export const adapterList = Object.values(adapters);