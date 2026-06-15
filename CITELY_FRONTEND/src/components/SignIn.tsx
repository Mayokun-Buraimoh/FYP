import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, BookOpen, Loader2 } from 'lucide-react';
import { login } from '../lib/api';

interface SignInProps {
    onSignIn?: () => void;
    onGoToSignUp?: () => void;
}

export function SignIn({ onSignIn, onGoToSignUp }: SignInProps) {
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            await login(email, password);
            onSignIn?.();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Sign in failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#e8ecf4] px-4 py-12">
            {/* Logo + Branding */}
            <div className="flex flex-col items-center mb-8">
                <div className="w-16 h-16 bg-[#1e3a6e] rounded-2xl flex items-center justify-center mb-4 shadow-lg">
                    <BookOpen className="w-8 h-8 text-white" strokeWidth={1.8} />
                </div>
                <h1 className="text-[28px] font-bold text-[#1e3a6e] tracking-tight">Citely</h1>
                <p className="text-[14px] text-slate-500 mt-1 font-medium">Smart Citation Management Platform</p>
            </div>

            {/* Card */}
            <div className="w-full max-w-[500px] bg-white rounded-2xl shadow-md px-10 py-10">
                <h2 className="text-[28px] font-bold text-gray-900 mb-1">Welcome Back</h2>
                <p className="text-[14px] text-slate-500 mb-8">Sign in to access your research workspace</p>

                {/* Error Banner */}
                {error && (
                    <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-600 font-medium">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Email */}
                    <div>
                        <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Email Address</label>
                        <div className="relative">
                            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="you@university.edu"
                                required
                                disabled={loading}
                                className="w-full pl-10 pr-4 py-3 bg-slate-100 rounded-xl text-[14px] text-gray-700 placeholder-slate-400 border border-transparent focus:outline-none focus:border-[#1e3a6e]/40 focus:ring-2 focus:ring-[#1e3a6e]/10 transition disabled:opacity-60"
                            />
                        </div>
                    </div>

                    {/* Password */}
                    <div>
                        <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Enter your password"
                                required
                                disabled={loading}
                                className="w-full pl-10 pr-11 py-3 bg-slate-100 rounded-xl text-[14px] text-gray-700 placeholder-slate-400 border border-transparent focus:outline-none focus:border-[#1e3a6e]/40 focus:ring-2 focus:ring-[#1e3a6e]/10 transition disabled:opacity-60"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    {/* Remember me + Forgot */}
                    <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={rememberMe}
                                onChange={e => setRememberMe(e.target.checked)}
                                className="w-4 h-4 rounded border-slate-300 accent-[#1e3a6e] cursor-pointer"
                            />
                            <span className="text-[13px] text-gray-600">Remember me</span>
                        </label>
                        <button type="button" className="text-[13px] font-semibold text-[#1e3a6e] hover:underline">
                            Forgot password?
                        </button>
                    </div>

                    {/* Sign In Button */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3.5 bg-[#1e3a6e] hover:bg-[#162d57] text-white font-semibold text-[15px] rounded-xl transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Signing in…
                            </>
                        ) : (
                            'Sign In'
                        )}
                    </button>
                </form>

                <p className="text-center text-[13px] text-slate-500 mt-7">
                    Don't have an account?{' '}
                    <button
                        onClick={onGoToSignUp}
                        className="font-bold text-[#1e3a6e] hover:underline"
                    >
                        Sign up
                    </button>
                </p>
            </div>

            {/* Bottom note */}
            <p className="mt-6 text-[12px] text-slate-400">
                By signing in, you agree to our Terms of Service and Privacy Policy
            </p>
        </div>
    );
}
