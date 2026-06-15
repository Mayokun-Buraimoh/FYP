import { Folder, UploadCloud, Search, Library, LogOut, GraduationCap } from 'lucide-react';
import { cn } from '../lib/utils';

export type ViewType = 'projects' | 'upload' | 'search' | 'library';

interface LibrarySidebarProps {
    onNavigate: (view: ViewType) => void;
    activeView: ViewType;
    onSignOut?: () => void;
}

export function LibrarySidebar({ onNavigate, activeView, onSignOut }: LibrarySidebarProps) {
    const navItems: { icon: typeof Folder; shortLabel: string; label: string; view: ViewType }[] = [
        { icon: Folder, shortLabel: 'Projects', label: 'My Projects', view: 'projects' },
        { icon: UploadCloud, shortLabel: 'Upload', label: 'Upload Papers', view: 'upload' },
        { icon: Search, shortLabel: 'Search', label: 'Global Paper Search', view: 'search' },
        { icon: Library, shortLabel: 'Library', label: 'Citation Library', view: 'library' },
    ];

    const navButtonClass = (isActive: boolean) =>
        cn(
            'flex flex-col items-center gap-1 w-full px-2 py-2.5 rounded-2xl transition-all duration-300',
            isActive
                ? 'bg-white/20 text-white shadow-lg'
                : 'text-white/60 hover:text-white hover:bg-white/10'
        );

    return (
        <div className="w-[5.5rem] h-screen bg-[#003366] flex flex-col items-center py-6 border-r border-white/5 sticky top-0 flex-shrink-0 z-50 shadow-2xl">
            {/* Brand */}
            <div
                className="mb-8 flex flex-col items-center gap-1 text-white cursor-pointer hover:scale-105 transition-transform"
                title="Citely"
            >
                <GraduationCap className="w-8 h-8" />
                <span className="text-[10px] font-semibold tracking-wide text-white/90">Citely</span>
            </div>

            {/* Navigation */}
            <div className="flex flex-col gap-3 flex-1 w-full px-2">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeView === item.view;
                    return (
                        <button
                            key={item.view}
                            type="button"
                            onClick={() => onNavigate(item.view)}
                            title={item.label}
                            className={navButtonClass(isActive)}
                        >
                            <Icon className="w-6 h-6 shrink-0" />
                            <span className="text-[10px] font-medium leading-tight text-center">
                                {item.shortLabel}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Sign out */}
            <div className="mt-auto w-full px-2">
                <button
                    type="button"
                    onClick={onSignOut}
                    title="Sign Out"
                    className="flex flex-col items-center gap-1 w-full px-2 py-2.5 rounded-2xl text-white/60 hover:text-red-300 hover:bg-white/10 transition-all duration-300"
                >
                    <LogOut className="w-6 h-6 shrink-0" />
                    <span className="text-[10px] font-medium leading-tight">Sign out</span>
                </button>
            </div>
        </div>
    );
}
