import { useState } from 'react';
import { User, Building2, Mail, Lock, Eye, EyeOff, BookOpen, Loader2, CheckCircle } from 'lucide-react';
import { register } from '../lib/api';

interface SignUpProps {
    onSignUp?: () => void;
    onGoToSignIn?: () => void;
}

export function SignUp({ onSignUp: _onSignUp, onGoToSignIn }: SignUpProps) {
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [agreed, setAgreed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [form, setForm] = useState({
        fullName: '',
        institution: '',
        email: '',
        password: '',
        confirmPassword: '',
    });

    const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(prev => ({ ...prev, [key]: e.target.value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (form.password !== form.confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        if (!agreed) {
            setError('Please agree to the Terms of Service to continue.');
            return;
        }

        setLoading(true);
        try {
            // fullName maps to username (what the backend expects)
            await register(form.email, form.fullName, form.password, form.confirmPassword);
            setSuccess(true);
            // Auto-redirect to sign in after 1.5s
            setTimeout(() => onGoToSignIn?.(), 1500);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
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
            <div className="w-full max-w-[580px] bg-white rounded-2xl shadow-md px-10 py-10">
                <h2 className="text-[28px] font-bold text-gray-900 mb-1">Create Your Account</h2>
                <p className="text-[14px] text-slate-500 mb-8">Start your research journey with smart citations</p>

                {/* Success Banner */}
                {success && (
                    <div className="mb-5 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-[13px] text-green-700 font-medium flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 shrink-0" />
                        Account created! Redirecting to sign in…
                    </div>
                )}

                {/* Error Banner */}
                {error && (
                    <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-600 font-medium">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Full Name + Institution — side by side */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Full Name</label>
                            <div className="relative">
                                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={form.fullName}
                                    onChange={set('fullName')}
                                    placeholder="Dr. John Doe"
                                    required
                                    disabled={loading || success}
                                    className="w-full pl-10 pr-4 py-3 bg-slate-100 rounded-xl text-[14px] text-gray-700 placeholder-slate-400 border border-transparent focus:outline-none focus:border-[#1e3a6e]/40 focus:ring-2 focus:ring-[#1e3a6e]/10 transition disabled:opacity-60"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Institution</label>
                            <div className="relative">
                                <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={form.institution}
                                    onChange={set('institution')}
                                    placeholder="Your University"
                                    disabled={loading || success}
                                    className="w-full pl-10 pr-4 py-3 bg-slate-100 rounded-xl text-[14px] text-gray-700 placeholder-slate-400 border border-transparent focus:outline-none focus:border-[#1e3a6e]/40 focus:ring-2 focus:ring-[#1e3a6e]/10 transition disabled:opacity-60"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Email */}
                    <div>
                        <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Email Address</label>
                        <div className="relative">
                            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="email"
                                value={form.email}
                                onChange={set('email')}
                                placeholder="you@university.edu"
                                required
                                disabled={loading || success}
                                className="w-full pl-10 pr-4 py-3 bg-slate-100 rounded-xl text-[14px] text-gray-700 placeholder-slate-400 border border-transparent focus:outline-none focus:border-[#1e3a6e]/40 focus:ring-2 focus:ring-[#1e3a6e]/10 transition disabled:opacity-60"
                            />
                        </div>
                    </div>

                    {/* Password + Confirm — side by side */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={form.password}
                                    onChange={set('password')}
                                    placeholder="Create a strong password"
                                    required
                                    disabled={loading || success}
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
                        <div>
                            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Confirm Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type={showConfirm ? 'text' : 'password'}
                                    value={form.confirmPassword}
                                    onChange={set('confirmPassword')}
                                    placeholder="Re-enter your password"
                                    required
                                    disabled={loading || success}
                                    className="w-full pl-10 pr-11 py-3 bg-slate-100 rounded-xl text-[14px] text-gray-700 placeholder-slate-400 border border-transparent focus:outline-none focus:border-[#1e3a6e]/40 focus:ring-2 focus:ring-[#1e3a6e]/10 transition disabled:opacity-60"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirm(!showConfirm)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                                >
                                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Terms */}
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={agreed}
                            onChange={e => setAgreed(e.target.checked)}
                            className="mt-0.5 w-4 h-4 rounded border-slate-300 accent-[#1e3a6e] cursor-pointer flex-shrink-0"
                        />
                        <span className="text-[13px] text-gray-600 leading-relaxed">
                            I agree to the{' '}
                            <button type="button" className="font-semibold text-[#1e3a6e] hover:underline">Terms of Service</button>
                            {' '}and{' '}
                            <button type="button" className="font-semibold text-[#1e3a6e] hover:underline">Privacy Policy</button>
                        </span>
                    </label>

                    {/* Create Account Button */}
                    <button
                        type="submit"
                        disabled={loading || success}
                        className="w-full py-3.5 bg-[#1e3a6e] hover:bg-[#162d57] text-white font-semibold text-[15px] rounded-xl transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Creating account…
                            </>
                        ) : (
                            'Create Account'
                        )}
                    </button>
                </form>

                <p className="text-center text-[13px] text-slate-500 mt-7">
                    Already have an account?{' '}
                    <button
                        onClick={onGoToSignIn}
                        className="font-bold text-[#1e3a6e] hover:underline"
                    >
                        Sign in
                    </button>
                </p>
            </div>

            {/* Bottom note */}
            <p className="mt-6 text-[12px] text-slate-400">
                Protected by industry-standard encryption and security protocols
            </p>
        </div>
    );
}
