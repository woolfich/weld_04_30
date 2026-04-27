'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';

interface AutoCompleteProps {
  suggestions: string[];
  value: string;
  onChange: (value: string) => void;
  onSelect: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function AutoComplete({ suggestions, value, onChange, onSelect, placeholder, className }: AutoCompleteProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() =>
    suggestions.filter(s =>
      s.toLowerCase().includes(value.toLowerCase())
    ).slice(0, 8),
    [suggestions, value]
  );

  const shouldShowDropdown = isFocused && filtered.length > 0 && value.length > 0;

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isFocused) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isFocused]);

  const handleSelect = useCallback((suggestion: string) => {
    onSelect(suggestion);
    setIsFocused(false);
    setSelectedIdx(-1);
  }, [onSelect]);

  const handleChange = useCallback((newValue: string) => {
    onChange(newValue);
    setIsFocused(true);
    setSelectedIdx(-1);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIdx >= 0 && selectedIdx < filtered.length) {
        handleSelect(filtered[selectedIdx]);
      } else if (filtered.length === 1) {
        handleSelect(filtered[0]);
      }
    } else if (e.key === 'Escape') {
      setIsFocused(false);
    }
  }, [filtered, selectedIdx, handleSelect]);

  return (
    <div className={`relative ${className || ''}`}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        inputMode="text"
        autoCapitalize="off"
        autoCorrect="off"
      />
      {shouldShowDropdown && (
        <div ref={dropdownRef} className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((suggestion, idx) => (
            <div
              key={suggestion}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-accent ${
                idx === selectedIdx ? 'bg-accent text-accent-foreground' : 'text-popover-foreground'
              }`}
              onMouseDown={() => handleSelect(suggestion)}
              onTouchStart={() => handleSelect(suggestion)}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
