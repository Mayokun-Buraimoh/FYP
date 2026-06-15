import React from "react";
import { CiteOrSnubTip } from "./CiteOrSnubTip";
import type { PdfSelection } from "react-pdf-highlighter-extended";

const MIN_SELECTION_LENGTH = 20;

interface SelectionTipProps {
    getSelection: () => PdfSelection | null;
    isLoading: boolean;
    onCite: (text: string) => void;
    onDismiss: () => void;
}

/** Rendered inside PdfHighlighter selectionTip — reads live selection from utils ref. */
export const SelectionTip: React.FC<SelectionTipProps> = ({
    getSelection,
    isLoading,
    onCite,
    onDismiss,
}) => {
    const selection = getSelection();
    const text = selection?.content?.text?.trim() ?? "";

    if (text.length > 0 && text.length < MIN_SELECTION_LENGTH) {
        return (
            <div className="px-3 py-2 text-xs font-medium text-slate-600 bg-white rounded-lg shadow border border-slate-200 max-w-[220px]">
                Select a full sentence (at least {MIN_SELECTION_LENGTH} characters).
            </div>
        );
    }

    if (!text) {
        return null;
    }

    return (
        <CiteOrSnubTip
            highlight={{
                id: "pending-selection",
                text,
                status: "unverified",
                position: {},
            }}
            isLoading={isLoading}
            onCite={() => onCite(text)}
            onSnub={() => onDismiss()}
        />
    );
};
