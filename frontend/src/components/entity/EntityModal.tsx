import { useState, useEffect, useCallback } from 'react';
import { Modal } from '../ui/Modal';
import { Divider } from '../ui/Divider';
import { Button } from '../ui/Button';

export interface EntityModalField<T extends Record<string, unknown>> {
  name: keyof T & string;
  label: string;
  type?: 'text' | 'number' | 'textarea' | 'select' | 'date';
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
}

export interface EntityModalSection<T extends Record<string, unknown>> {
  title: string;
  fields: EntityModalField<T>[];
}

export interface EntityModalProps<T extends Record<string, unknown>> {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<T>) => Promise<void>;
  entity?: T | null;
  sections: EntityModalSection<T>[];
  title: string;
  isSubmitting?: boolean;
  isDirty?: boolean;
}

// Controlled field styling — uses defined design tokens
const fieldClass =
  'w-full h-10 rounded-md text-sm px-3 ' +
  'bg-surface-raised border border-border text-text-primary ' +
  'placeholder:text-text-muted transition-colors duration-150 ' +
  'focus:outline-none focus:ring-2 focus:ring-glow-primary focus:border-border-focus ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

const textareaClass =
  'w-full rounded-md text-sm px-3 py-2 ' +
  'bg-surface-raised border border-border text-text-primary ' +
  'placeholder:text-text-muted transition-colors duration-150 ' +
  'focus:outline-none focus:ring-2 focus:ring-glow-primary focus:border-border-focus';

export function EntityModal<T extends Record<string, unknown>>({
  isOpen,
  onClose,
  onSave,
  entity,
  sections,
  title,
  isSubmitting = false,
  isDirty = false,
}: EntityModalProps<T>) {
  // Controlled form state — keyed by field name (G-07)
  const [formValues, setFormValues] = useState<Record<string, string | number>>({});

  // Initialise / reset when entity or open state changes
  useEffect(() => {
    if (!isOpen) return;
    const initial: Record<string, string | number> = {};
    for (const section of sections) {
      for (const field of section.fields) {
        const raw = entity?.[field.name];
        initial[field.name] =
          raw != null ? (typeof raw === 'number' ? raw : String(raw)) : '';
      }
    }
    setFormValues(initial);
  }, [isOpen, entity, sections]);

  const handleChange = useCallback(
    (name: string, value: string | number) => {
      setFormValues((prev) => ({ ...prev, [name]: value }));
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    const data: Partial<T> = {};
    if (entity?.id != null) {
      (data as Record<string, unknown>).id = entity.id;
    }
    for (const section of sections) {
      for (const field of section.fields) {
        const raw = formValues[field.name];
        if (field.type === 'number') {
          (data as Record<string, unknown>)[field.name] =
            raw !== '' && raw != null ? Number(raw) : undefined;
        } else {
          (data as Record<string, unknown>)[field.name] = raw ?? '';
        }
      }
    }
    await onSave(data);
  }, [entity, sections, formValues, onSave]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} isDirty={isDirty} size="lg">
      <div className="space-y-6">
        {sections.map((section, sectionIdx) => (
          <div key={sectionIdx}>
            {sectionIdx > 0 && <Divider />}
            <Divider label={section.title} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {section.fields.map((field) => {
                const value = formValues[field.name] ?? '';
                return (
                  <div key={field.name} className="space-y-1.5">
                    <label
                      htmlFor={`modal-field-${field.name}`}
                      className="block text-sm font-medium text-text-secondary"
                    >
                      {field.label}
                      {field.required && (
                        <span className="text-error ml-1" aria-hidden="true">*</span>
                      )}
                    </label>

                    {field.type === 'select' ? (
                      <select
                        id={`modal-field-${field.name}`}
                        className={fieldClass}
                        value={String(value)}
                        required={field.required}
                        onChange={(e) => handleChange(field.name, e.target.value)}
                      >
                        <option value="">Select…</option>
                        {field.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : field.type === 'textarea' ? (
                      <textarea
                        id={`modal-field-${field.name}`}
                        className={textareaClass}
                        placeholder={field.placeholder}
                        required={field.required}
                        rows={3}
                        value={String(value)}
                        onChange={(e) => handleChange(field.name, e.target.value)}
                      />
                    ) : (
                      <input
                        type={field.type ?? 'text'}
                        id={`modal-field-${field.name}`}
                        className={fieldClass}
                        placeholder={field.placeholder}
                        required={field.required}
                        value={value}
                        onChange={(e) =>
                          handleChange(
                            field.name,
                            field.type === 'number'
                              ? e.target.value
                              : e.target.value,
                          )
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-border">
        <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          loading={isSubmitting}
          disabled={isSubmitting}
        >
          Save
        </Button>
      </div>
    </Modal>
  );
}
