import { useState, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { Link, useRouter } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

export function Login() {
  const { navigate } = useRouter();
  const { session } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (session) navigate('/account');
  }, [session, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (mode === 'signup') {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone: phone.trim(),
          },
        },
      });
      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }
      if (data.user && !data.session) {
        setMessage('Account created! If email confirmation is required, please check your inbox. Otherwise, try logging in.');
        setMode('login');
        setLoading(false);
        return;
      }
      if (data.session) navigate('/account');
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }
      navigate('/account');
    }
    setLoading(false);
  }

  return (
    <div className="animate-fade-in mx-auto max-w-md px-4 py-16 lg:px-8">
      <div className="card p-8">
        <h1 className="mb-2 text-2xl font-semibold text-charcoal-900">
          {mode === 'login' ? 'Welcome Back' : 'Create Your Account'}
        </h1>
        <p className="mb-6 text-sm text-charcoal-500">
          {mode === 'login'
            ? 'Sign in to view your booking history and track orders.'
            : 'Sign up to manage your bookings and saved addresses.'}
        </p>

        <div className="mb-6 flex rounded-xl bg-ivory-200 p-1">
          <button
            onClick={() => setMode('login')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              mode === 'login' ? 'bg-ivory-50 text-forest-700 shadow-soft' : 'text-charcoal-500'
            }`}
          >
            Login
          </button>
          <button
            onClick={() => setMode('signup')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              mode === 'signup' ? 'bg-ivory-50 text-forest-700 shadow-soft' : 'text-charcoal-500'
            }`}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <>
              <div>
                <label className="label-field">Full Name</label>
                <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="input-field" required />
              </div>
              <div>
                <label className="label-field">Phone Number</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="input-field" placeholder="10-digit mobile number" />
              </div>
            </>
          )}
          <div>
            <label className="label-field">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" required />
          </div>
          <div>
            <label className="label-field">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field" required minLength={6} />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}
          {message && (
            <div className="rounded-lg bg-forest-50 p-3 text-sm text-forest-700">{message}</div>
          )}

          {mode === 'login' && (
            <div className="text-right">
              <button
                type="button"
                onClick={async () => {
                  if (!email.trim()) {
                    setError('Enter your email above first, then tap Forgot Password.');
                    return;
                  }
                  setLoading(true);
                  setError(null);
                  const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
                  setLoading(false);
                  if (resetError) {
                    setError(resetError.message);
                  } else {
                    setMessage('Password reset email sent! Check your inbox.');
                  }
                }}
                className="text-xs text-forest-600 hover:underline"
              >
                Forgot Password?
              </button>
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-charcoal-400">
          You can also <Link to="/book" className="text-forest-600 hover:underline">book without an account</Link>.
        </p>
      </div>
    </div>
  );
}
