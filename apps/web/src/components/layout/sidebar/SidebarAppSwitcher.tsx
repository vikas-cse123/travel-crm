import { MessageCircle } from 'lucide-react';
import { cn } from '@/utils/cn';
import { WHATSAPP_CRM_URL } from '../navigation';

/**
 * Cross-app launcher to the sister product, the Interscale WhatsApp CRM.
 *
 * Modelled on the "switch to our other app" tile (Zomato → Blinkit): a
 * distinct, brand-coloured entry pinned below the navigation. Because the
 * WhatsApp CRM is a separate application on its own domain, this is a plain
 * external anchor that opens in a new tab (never a router link), with
 * `rel="noopener noreferrer"` so the opened tab cannot reach back into this
 * one. It matches the collapsed-rail behaviour of the nav items: the label is
 * hidden on the collapsed desktop rail but kept for the mobile drawer, and the
 * accessible name is always present via `aria-label`.
 */
export function SidebarAppSwitcher({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="border-t border-sidebar-border px-2.5 py-3">
      <a
        href={WHATSAPP_CRM_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open Interscale WhatsApp CRM in a new tab"
        title="Open Interscale WhatsApp CRM in a new tab"
        className={cn(
          'flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors duration-150',
          'bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/20 hover:bg-emerald-500/15',
          collapsed && 'lg:justify-center',
        )}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500 text-white">
          <MessageCircle className="h-[15px] w-[15px]" aria-hidden="true" strokeWidth={2} />
        </span>
        <span className={cn('flex min-w-0 flex-col leading-tight', collapsed && 'lg:hidden')}>
          <span className="truncate">WhatsApp CRM</span>
          <span className="truncate text-[10px] font-normal text-emerald-600/80">
            Switch to Interscale Chat ↗
          </span>
        </span>
      </a>
    </div>
  );
}
