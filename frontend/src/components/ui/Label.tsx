import React from 'react';
import { AlertCircle } from 'lucide-react';

interface LabelProps {
	htmlFor?: string;
	required?: boolean;
	helper?: string;
	error?: string;
	children: React.ReactNode;
	className?: string;
}

export const Label: React.FC<LabelProps> = ({
	htmlFor,
	required = false,
	helper,
	error,
	children,
	className = '',
}) => {
	const labelId = htmlFor ? `${htmlFor}-label` : undefined;
	const helperId = helper || error ? `${htmlFor}-helper` : undefined;

	return (
		<div>
			<label htmlFor={htmlFor} id={labelId} className={`block mb-1 ${className}`}>
				<span className="text-sm font-medium text-text-secondary">{children}</span>
				{required && <span className="text-error ml-1" aria-hidden="true">*</span>}
				{required && <span className="sr-only">(required)</span>}
			</label>
			{helper && !error && (
				<p id={helperId} className="mt-1 text-xs text-text-muted">
					{helper}
				</p>
			)}
			{error && (
				<p id={helperId} className="mt-1 text-xs text-error flex items-center gap-1">
					<AlertCircle size={12} aria-hidden="true" />
					{error}
				</p>
			)}
		</div>
	);
};
