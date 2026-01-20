import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { normalizeForKeyboardNav } from '../utils/textNormalization';

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  className = '',
  disabled = false,
  required = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [searchBuffer, setSearchBuffer] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchBuffer('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && value) {
      const index = options.findIndex(opt => opt.value === value);
      if (index !== -1) {
        setHighlightedIndex(index);
        scrollToIndex(index);
      }
    }
  }, [isOpen, value, options]);

  const scrollToIndex = (index: number) => {
    if (listRef.current) {
      const element = listRef.current.children[index] as HTMLElement;
      if (element) {
        element.scrollIntoView({ block: 'nearest' });
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearchBuffer('');
        break;

      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < options.length) {
          onChange(options[highlightedIndex].value);
          setIsOpen(false);
          setSearchBuffer('');
        }
        break;

      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => {
          const next = prev < options.length - 1 ? prev + 1 : prev;
          scrollToIndex(next);
          return next;
        });
        break;

      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => {
          const next = prev > 0 ? prev - 1 : 0;
          scrollToIndex(next);
          return next;
        });
        break;

      case 'Home':
        e.preventDefault();
        setHighlightedIndex(0);
        scrollToIndex(0);
        break;

      case 'End':
        e.preventDefault();
        setHighlightedIndex(options.length - 1);
        scrollToIndex(options.length - 1);
        break;

      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          handleSearch(e.key);
        }
        break;
    }
  };

  const handleSearch = (key: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const newBuffer = searchBuffer + key.toLowerCase();
    setSearchBuffer(newBuffer);

    const matchIndex = options.findIndex(option => {
      const normalizedLabel = normalizeForKeyboardNav(option.label);
      return normalizedLabel.startsWith(newBuffer);
    });

    if (matchIndex !== -1) {
      setHighlightedIndex(matchIndex);
      scrollToIndex(matchIndex);
    }

    searchTimeoutRef.current = setTimeout(() => {
      setSearchBuffer('');
    }, 1000);
  };

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchBuffer('');
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`w-full px-3 py-2 border rounded-lg text-left flex items-center justify-between ${
          disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white hover:border-blue-500'
        } ${className}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        required={required}
      >
        <span className={selectedOption ? 'text-gray-900' : 'text-gray-400'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          ref={listRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"
          role="listbox"
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-gray-500 text-sm">No options available</div>
          ) : (
            options.map((option, index) => (
              <div
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className={`px-3 py-2 cursor-pointer ${
                  index === highlightedIndex
                    ? 'bg-blue-500 text-white'
                    : option.value === value
                    ? 'bg-blue-50 text-blue-900'
                    : 'hover:bg-gray-100'
                }`}
                role="option"
                aria-selected={option.value === value}
              >
                {option.label}
              </div>
            ))
          )}
        </div>
      )}

      {searchBuffer && isOpen && (
        <div className="absolute top-full left-0 mt-1 px-2 py-1 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
          Searching: {searchBuffer}
        </div>
      )}
    </div>
  );
}
