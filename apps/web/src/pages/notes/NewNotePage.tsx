import { useState } from 'react';
import { ArrowLeft, NotebookPen } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { LeadSearchSelect } from '@/features/queries/LeadSearchSelect';

/**
 * Lead step for "Add Note" from the Notes page.
 *
 * A note always belongs to a lead (`POST /queries/:queryId/notes`), so the only
 * thing collected here is which lead — then it hands off to the existing
 * `/queries/:id/notes/new` form rather than duplicating it. Laid out to match
 * {@link NewQuotationPage}, which solves the same "pick a lead first" step.
 *
 * Search runs through {@link LeadSearchSelect}, so the same tenant/RBAC
 * visibility rules that govern the Leads page govern what can be picked.
 */
export function NewNotePage() {
  const navigate = useNavigate();
  const [queryId, setQueryId] = useState('');

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex items-center gap-3">
        <Link to="/notes" className="rounded-lg p-2 hover:bg-card">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <p className="text-sm text-slate-500">Lead notes</p>
          <h1 className="text-2xl font-semibold">Add note</h1>
        </div>
      </header>
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="font-semibold">Choose the lead to note against</h2>
        <div className="mt-5 space-y-4">
          {/* Not a <label>: the combobox renders its option list inside this
              block, and a wrapping label would re-focus the input on every
              option click. The input carries its own aria-label instead. */}
          <div>
            <p className="text-sm font-medium">Lead</p>
            <div className="mt-1">
              <LeadSearchSelect value={queryId} onChange={setQueryId} />
            </div>
          </div>
          <Button
            fullWidth
            disabled={!queryId}
            onClick={() => navigate(`/queries/${queryId}/notes/new`)}
          >
            <NotebookPen className="h-4 w-4" />
            Continue
          </Button>
        </div>
      </section>
    </div>
  );
}
