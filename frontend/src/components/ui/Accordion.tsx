import { useState, ReactNode } from 'react';
import { Icon } from './Icon';
import { ChevronDown } from 'lucide-react';

interface AccordionItemProps {
  title: string;
  content: ReactNode;
}

interface AccordionProps {
  items: AccordionItemProps[];
  allowMultiple?: boolean;
}

export const Accordion = ({ items, allowMultiple = false }: AccordionProps) => {
  const [openIndices, setOpenIndices] = useState<Set<number>>(() => {
    return new Set<number>();
  });

  const toggle = (index: number) => {
    setOpenIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        if (!allowMultiple) {
          next.clear();
        }
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {items.map((item, index) => {
        const isOpen = openIndices.has(index);
        return (
          <div key={index} className="border border-border rounded-lg overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between p-4 bg-surface hover:bg-surface-hover transition-colors text-left"
              onClick={() => toggle(index)}
              aria-expanded={isOpen}
            >
              <span className="font-medium text-text">{item.title}</span>
              <Icon
                icon={ChevronDown}
                size="sm"
                className={`transition-transform duration-normal ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {isOpen && (
              <div
                className="overflow-hidden transition-all duration-normal"
              >
                <div className="p-4 bg-surface-raised border-t border-border">
                  {item.content}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
