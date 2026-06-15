import { ChevronDown } from 'lucide-react';
import { getPublicationYearOptions, parseYearInput } from '../lib/yearFilter';
import { cn } from '../lib/utils';

const ALL_YEARS = getPublicationYearOptions();

interface PublicationYearSelectProps {
    value: number | null;
    onChange: (year: number | null) => void;
    label: string;
    /** Only show years >= this (for "to" when "from" is set). */
    minYear?: number | null;
    /** Only show years <= this (for "from" when "to" is set). */
    maxYear?: number | null;
    className?: string;
}

export function PublicationYearSelect({
    value,
    onChange,
    label,
    minYear = null,
    maxYear = null,
    className,
}: PublicationYearSelectProps) {
    const options = ALL_YEARS.filter((y) => {
        if (minYear != null && y < minYear) return false;
        if (maxYear != null && y > maxYear) return false;
        return true;
    });

    return (
        <div className={cn('relative', className)}>
            <select
                value={value ?? ''}
                onChange={(e) => onChange(parseYearInput(e.target.value))}
                className="appearance-none w-full border border-slate-border pl-3 pr-8 py-2 rounded-xl text-[12px] font-medium text-slate-text bg-white hover:bg-slate-50 cursor-pointer outline-none focus:border-[#003366]"
                aria-label={label}
            >
                <option value="">Any</option>
                {options.map((year) => (
                    <option key={year} value={year}>
                        {year}
                    </option>
                ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
    );
}
