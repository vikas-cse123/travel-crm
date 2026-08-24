import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useArchiveFaq, useFaq } from '@/features/masters/masters.api';
import { MasterHeader, StatusBadge } from './MasterUi';

export function FaqDetailsPage() {
  const { faqId } = useParams();
  const navigate = useNavigate();
  const faq = useFaq(faqId);
  const archive = useArchiveFaq();

  if (faq.isError) return <Navigate to="/masters/faqs" replace />;
  if (faq.isPending) return <div className="h-64 animate-pulse rounded-xl bg-card" />;
  if (!faq.data) return null;

  const row = faq.data;

  const onArchive = () => {
    if (window.confirm('Archive this FAQ?')) {
      archive.mutate(row.id, { onSuccess: () => navigate('/masters/faqs') });
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <MasterHeader
        title="FAQ Details"
        current={row.question.length > 40 ? `${row.question.slice(0, 40)}…` : row.question}
      />

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b bg-gradient-to-r from-brand-700 to-blue-600 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">{row.question}</h2>
              <p className="mt-1 text-sm text-white/80">
                Created by {row.createdBy.fullName}
                {row.updatedBy ? ` · updated by ${row.updatedBy.fullName}` : ''}
              </p>
            </div>
            <StatusBadge value={row.status} />
          </div>
        </div>

        <div className="space-y-6 p-5">
          {row.destinations?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {row.destinations.map((d) => (
                <span
                  key={d}
                  className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700"
                >
                  {d}
                </span>
              ))}
            </div>
          ) : (
            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              Applies to all destinations
            </span>
          )}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Answer</p>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-700">
              {row.answer}
            </p>
          </div>

          <div className="flex gap-2 border-t pt-4">
            <Link to={`/masters/faqs/${row.id}/edit`}>
              <Button>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            </Link>
            <Button variant="danger" onClick={onArchive} isLoading={archive.isPending}>
              <Trash2 className="h-4 w-4" />
              Archive
            </Button>
            <Link to="/masters/faqs">
              <Button variant="secondary">Back to list</Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}