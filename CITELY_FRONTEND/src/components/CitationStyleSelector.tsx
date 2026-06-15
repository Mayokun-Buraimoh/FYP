import { ChevronDown } from 'lucide-react';
import {
    CITATION_STYLE_GROUPS,
    normalizeCitationStyleId,
    type CitationStyleId,
} from '../lib/citationEngine';

interface CitationStyleSelectorProps {
    value: CitationStyleId;
    onChange: (style: CitationStyleId) => void;
}

export function CitationStyleSelector({ value, onChange }: CitationStyleSelectorProps) {
    const safeValue = normalizeCitationStyleId(value);

    return (
        <div className="relative">
            <select
                value={safeValue}
                onChange={(e) => onChange(normalizeCitationStyleId(e.target.value))}
                className="appearance-none border border-slate-border pl-4 pr-10 py-2 rounded-xl text-sm font-medium text-slate-text bg-white hover:bg-slate-50 cursor-pointer outline-none focus:border-[#003366] max-w-[220px] sm:max-w-[280px]"
                aria-label="Citation style"
            >
                {CITATION_STYLE_GROUPS.map((group) => (
                    <optgroup key={group.family} label={group.family}>
                        {group.options.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                                {opt.label}
                            </option>
                        ))}
                    </optgroup>
                ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
    );
}
