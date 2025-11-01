'use client';

import React, { createContext, useContext, useState } from 'react';

const SelectContext = createContext<{ 
  value: string; 
  setValue: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

export function Select({ 
  value: controlledValue,
  onValueChange,
  defaultValue = '',
  children 
}: { 
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string;
  children: React.ReactNode;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const value = controlledValue !== undefined ? controlledValue : internalValue;
  
  const setValue = (newValue: string) => {
    if (controlledValue === undefined) {
      setInternalValue(newValue);
    }
    onValueChange?.(newValue);
    setOpen(false);
  };

  return (
    <SelectContext.Provider value={{ value, setValue, open, setOpen }}>
      <div className="relative">
        {children}
      </div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ 
  className = '', 
  children 
}: { 
  className?: string;
  children: React.ReactNode;
}) {
  const context = useContext(SelectContext);
  if (!context) throw new Error('SelectTrigger must be used within Select');

  return (
    <button
      type="button"
      onClick={() => context.setOpen(!context.open)}
      className={`flex h-10 w-full items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
      <svg className="h-4 w-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const context = useContext(SelectContext);
  if (!context) throw new Error('SelectValue must be used within Select');

  return <span>{context.value || placeholder}</span>;
}

export function SelectContent({ 
  className = '', 
  children 
}: { 
  className?: string;
  children: React.ReactNode;
}) {
  const context = useContext(SelectContext);
  if (!context) throw new Error('SelectContent must be used within Select');

  if (!context.open) return null;

  return (
    <div className={`absolute top-full z-50 mt-1 max-h-96 w-full overflow-auto rounded-md border bg-white shadow-md ${className}`}>
      <div className="p-1">
        {children}
      </div>
    </div>
  );
}

export function SelectItem({ 
  value, 
  className = '', 
  children 
}: { 
  value: string; 
  className?: string;
  children: React.ReactNode;
}) {
  const context = useContext(SelectContext);
  if (!context) throw new Error('SelectItem must be used within Select');

  const isSelected = context.value === value;

  return (
    <div
      onClick={() => context.setValue(value)}
      className={`relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none hover:bg-gray-100 focus:bg-gray-100 ${
        isSelected ? 'bg-gray-100' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
