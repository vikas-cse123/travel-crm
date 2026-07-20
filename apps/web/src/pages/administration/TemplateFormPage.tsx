import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card, CardBody } from '@/components/ui/Card';
import { ApiError } from '@/api/client';
import { TemplateForm } from '@/features/administration/TemplateForm';
import { useSaveTemplate, useTemplate } from '@/features/administration/admin.api';
export function TemplateFormPage() {
  const { id } = useParams();
  const q = useTemplate(id);
  const save = useSaveTemplate(id);
  const nav = useNavigate();
  if (id && q.isLoading) return <div className="h-96 animate-pulse bg-slate-100" />;
  if (id && !q.data) return <p>Template not found or access denied.</p>;
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <p className="text-sm text-slate-500">
          <Link to="/permission-templates">Permission Templates</Link> / {id ? 'Edit' : 'New'}
        </p>
        <h1 className="text-2xl font-semibold">{id ? 'Edit template' : 'Create template'}</h1>
      </header>
      <Card>
        <CardBody>
          <TemplateForm
            template={q.data}
            pending={save.isPending}
            error={save.error instanceof ApiError ? save.error.message : undefined}
            onSubmit={(v) =>
              save.mutate(v, { onSuccess: (t) => nav(`/permission-templates/${t.id}`) })
            }
          />
        </CardBody>
      </Card>
    </div>
  );
}
