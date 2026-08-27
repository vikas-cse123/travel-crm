import { useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { MasterHeader } from './MasterUi';
import { ExcelImportDialog } from '@/features/masters/excel-import/ExcelImportDialog';
import type { SupportedMasterType } from '@/features/masters/excel-import/excelImport.api';

const MASTERS: Array<{ key: SupportedMasterType; label: string; description: string }> = [
  { key: 'CITY', label: 'Cities', description: 'City Name, Country Code, Airport Code' },
  { key: 'AIRLINE', label: 'Airlines', description: 'Airline Name, IATA, ICAO, Country' },
  { key: 'CRUISE', label: 'Cruises', description: 'Cruise Name, Description, Price' },
  { key: 'VEHICLE', label: 'Vehicles', description: 'Vehicle Name, Type, Capacity, Price' },
  { key: 'ADD_ON_SERVICE', label: 'Add-on Services', description: 'Service Name, Description, Price' },
  { key: 'DESTINATION', label: 'Destinations', description: 'Country, Destination Name, Type, Cities' },
  { key: 'SIGHTSEEING', label: 'Sightseeing', description: 'Destination, City, Title, Pricing' },
  { key: 'HOTEL', label: 'Hotels', description: 'Name, Destination, City, Rooms, Meals, Rates' },
];

export function MastersImportPage() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<SupportedMasterType | null>(null);

  const handleSelect = (key: SupportedMasterType) => {
    setSelected(key);
    setOpen(true);
  };

  return (
    <div className="space-y-5">
      <MasterHeader title="Import Masters" current="Import" description="Import master data from Excel" />
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <h3 className="font-semibold text-slate-800">Choose Master to Import</h3>
        <p className="mt-1 text-sm text-slate-500">Select a master type to download its template and import data.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {MASTERS.map((m) => (
            <button
              key={m.key}
              onClick={() => handleSelect(m.key)}
              className="flex flex-col items-start rounded-xl border p-4 text-left hover:border-brand-600 hover:bg-brand-50"
            >
              <FileSpreadsheet className="h-6 w-6 text-brand-600" />
              <span className="mt-2 font-medium">{m.label}</span>
              <span className="text-xs text-slate-500">{m.description}</span>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600">
                <Upload className="h-3 w-3" /> Import Excel
              </span>
            </button>
          ))}
        </div>
      </section>

      <ExcelImportDialog open={open} onClose={() => setOpen(false)} initialMasterType={selected} onSuccess={() => {}} />
    </div>
  );
}
