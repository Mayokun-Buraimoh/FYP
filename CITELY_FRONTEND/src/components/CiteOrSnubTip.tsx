import React from "react";
export type HighlightStatus = "unverified" | "cited";

export interface SemanticHighlight {
    id: string;
    position: any;
    content?: any;
    status: HighlightStatus;
    text: string;
}

interface TipProps {
    highlight: SemanticHighlight;
    onCite: (highlight: SemanticHighlight) => void;
    onSnub: (highlightId: string) => void;
    isLoading?: boolean;
}

export const CiteOrSnubTip: React.FC<TipProps> = ({ highlight, onCite, onSnub, isLoading }) => {
    return (
        <div className="flex bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden z-50">
            <button
                type="button"
                disabled={isLoading}
                onClick={() => onCite(highlight)}
                className="px-4 py-2 text-sm font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors border-r border-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLoading ? "Finding…" : "Find citations"}
            </button>
            <button
                type="button"
                disabled={isLoading}
                onClick={() => onSnub(highlight.id)}
                className="px-4 py-2 text-sm font-bold text-red-700 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
            >
                Snub
            </button>
        </div>
    );
};
