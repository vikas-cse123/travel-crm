import { useMemo, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import type { PermissionGroup } from '@interscale/shared';
import { SENSITIVE_PERMISSION_KEYS } from './sensitive-permissions';
export function PermissionPicker({
  groups,
  value,
  onChange,
}: {
  groups: PermissionGroup[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const selected = new Set(value);
  const visible = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          permissions: g.permissions.filter((p) =>
            `${p.key} ${p.description}`.toLowerCase().includes(search.toLowerCase()),
          ),
        }))
        .filter((g) => g.permissions.length),
    [groups, search],
  );
  const toggle = (key: string) =>
    onChange(selected.has(key) ? value.filter((k) => k !== key) : [...value, key]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <label className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            aria-label="Search permissions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm"
            placeholder="Search permissions"
          />
        </label>
        <span className="text-sm font-medium">{value.length} selected</span>
      </div>
      {value.some((k) => SENSITIVE_PERMISSION_KEYS.has(k)) && (
        <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          Sensitive administration permissions selected.
        </p>
      )}
      {visible.map((g) => {
        const available = g.permissions.filter((p) => p.isAvailable);
        return (
          <section key={g.module} className="rounded-lg border">
            <header className="flex items-center justify-between bg-slate-50 px-4 py-3">
              <h3 className="font-medium">{g.label}</h3>
              <div className="space-x-3 text-xs">
                <button
                  type="button"
                  onClick={() => onChange([...new Set([...value, ...available.map((p) => p.key)])])}
                >
                  Select available
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange(value.filter((k) => !g.permissions.some((p) => p.key === k)))
                  }
                >
                  Clear
                </button>
              </div>
            </header>
            <div className="grid gap-2 p-4 md:grid-cols-2">
              {g.permissions.map((p) => (
                <label
                  key={p.key}
                  className={`flex gap-3 rounded p-2 text-sm ${p.isAvailable ? 'hover:bg-slate-50' : 'cursor-not-allowed opacity-50'}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(p.key)}
                    disabled={!p.isAvailable}
                    onChange={() => toggle(p.key)}
                  />
                  <span>
                    <span className="block font-medium">{p.key}</span>
                    <span className="text-xs text-slate-500">
                      {p.description}
                      {!p.isAvailable ? ' — Coming soon' : ''}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
