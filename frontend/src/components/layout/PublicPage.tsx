import React from 'react';

interface PublicPageProps {
  title?: string;
  /** Optional subtitle rendered between the title and the card */
  subtitle?: string;
  children: React.ReactNode;
}

export function PublicPage({ title, subtitle, children }: PublicPageProps) {
  return (
    <div className="w-full flex items-center justify-center min-h-screen bg-bg">
      <div className="w-full max-w-content mx-4">
        {title && (
          <h1 className="text-2xl font-semibold text-text-primary text-center mb-2">
            {title}
          </h1>
        )}
        {subtitle && (
          <p className="text-text-secondary text-sm text-center mb-6">{subtitle}</p>
        )}
        {/* When title without subtitle, preserve spacing before card */}
        {title && !subtitle && <div className="mb-6" />}
        <div className="bg-surface-raised border border-border rounded-lg p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
