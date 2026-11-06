import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="crm-page-header flex flex-wrap items-start justify-between gap-3 border-b px-4 py-5 sm:px-6">
      <div className="min-w-0 flex-1 basis-48">
        <h1 className="break-words text-2xl font-semibold tracking-normal text-foreground">{title}</h1>
        {description && (
          <p className="mt-1 max-w-3xl break-words text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      {Icon && (
        <div className="rounded-full bg-muted p-3 text-muted-foreground">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <div>
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground max-w-md">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}