import React from 'react';
import { Modal } from '../ui/Modal';
import { Divider } from '../ui/Divider';
import { Spinner } from '../ui/Spinner';

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
  const handleSubmit = async () => {
    const formData: Partial<T> = {};

    if (entity) {
      formData.id = entity.id;
    }

    for (const section of sections) {
      for (const field of section.fields) {
        const input = document.getElementById(`entity-field-${String(field.name)}`);
        if (input) {
          if (input instanceof HTMLSelectElement) {
            formData[field.name] = input.value as any;
          } else {
            const value = (input as HTMLInputElement).value;
            if (field.type === 'number' && value) {
              formData[field.name] = Number(value) as any;
            } else {
              formData[field.name] = value as any;
            }
          }
        }
      }
    }

    await onSave(formData);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && isDirty) {
      e.preventDefault();
    }
  };

  const getFieldValue = (fieldName: keyof T): string | number => {
    if (!entity) return '';
    return (entity[fieldName] as string | number) || '';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      isDirty={isDirty}
      size="lg"
    >
      <div onKeyDown={handleKeyDown}>
        <div className="space-y-6">
          {sections.map((section, sectionIdx) => (
            <div key={sectionIdx}>
              {sectionIdx > 0 && <Divider />}
              <Divider label={section.title} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {section.fields.map((field) => (
                  <div key={String(field.name)} className="space-y-2">
                    <label
                      htmlFor={`entity-field-${String(field.name)}`}
                      className="block text-sm font-medium text-text-secondary"
                    >
                      {field.label}
                      {field.required && (
                        <span className="text-red-500 ml-1">*</span>
                      )}
                    </label>

                    {field.type === 'select' ? (
                      <select
                        id={`entity-field-${String(field.name)}`}
                        className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                        required={field.required}
                      >
                        <option value="">Select...</option>
                        {field.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : field.type === 'textarea' ? (
                      <textarea
                        id={`entity-field-${String(field.name)}`}
                        className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder={field.placeholder}
                        required={field.required}
                        rows={3}
                        defaultValue={getFieldValue(field.name) as string}
                      />
                    ) : (
                      <input
                        type={field.type || 'text'}
                        id={`entity-field-${String(field.name)}`}
                        className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder={field.placeholder}
                        required={field.required}
                        defaultValue={getFieldValue(field.name) as string | number}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-border-primary">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting && <Spinner size="sm" />}
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
