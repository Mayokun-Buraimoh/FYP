import { ChevronDown, Sparkles, ArrowLeft } from 'lucide-react';

interface EditorProps {
    onBack?: () => void;
}

export function Editor({ onBack }: EditorProps) {
    return (
        <div className="flex-1 bg-white min-h-screen overflow-y-auto">
            {/* Top Navigation */}
            <div className="h-16 border-b border-slate-border px-8 flex items-center justify-between sticky top-0 bg-white z-10">
                <div className="flex items-center gap-4">
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="p-2 -ml-2 text-slate-400 hover:text-slate-text hover:bg-slate-50 rounded-lg transition-colors"
                            title="Back to Projects"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                    )}
                    <h1 className="text-lg font-semibold text-slate-text">Manuscript: Transformers in NLP</h1>
                    <span className="text-slate-secondary text-sm italic">Draft saved 2m ago</span>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 border border-slate-border px-4 py-2 rounded-xl text-sm font-medium text-slate-text hover:bg-slate-border transition-colors cursor-pointer">
                        <span>Citation Style: APA 7th Edition</span>
                        <ChevronDown className="w-4 h-4" />
                    </div>
                    <button className="bg-navy-blue text-white px-6 py-2 rounded-xl font-medium shadow-lg shadow-navy-blue/20 hover:bg-opacity-95 transition-all">
                        Export Results
                    </button>
                </div>
            </div>

            {/* Editor Content */}
            <div className="max-w-[740px] mx-auto py-16 px-12">
                <h2 className="text-[30px] font-bold text-slate-text mb-8">1. Introduction</h2>

                <div className="space-y-6 text-[18px] leading-relaxed text-slate-text">
                    <p className="relative transition-all group">
                        The field of Natural Language Processing (NLP) has undergone a paradigm shift with the introduction of the Transformer architecture.
                        Before the advent of transformers, recurrent neural networks (RNNs) and long short-term memory (LSTM) networks were the standard for sequential data processing.
                        <button className="absolute -left-12 top-1 opacity-0 group-hover:opacity-100 transition-opacity p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full text-white shadow-lg">
                            <Sparkles className="w-4 h-4" />
                        </button>
                    </p>

                    <p className="relative transition-all group">
                        However, these models suffered from limitations in parallelization and long-range dependency modeling.
                        The attention mechanism allowed the model to focus on different parts of the input sequence regardless of their distance.
                        <button className="absolute -left-12 top-1 opacity-0 group-hover:opacity-100 transition-opacity p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full text-white shadow-lg">
                            <Sparkles className="w-4 h-4" />
                        </button>
                    </p>

                    <h2 className="text-[24px] font-bold text-slate-text mt-12 mb-4">2. Methodology</h2>
                    <p className="text-slate-secondary italic">Start writing your methodology section here...</p>
                </div>
            </div>
        </div>
    );
}
