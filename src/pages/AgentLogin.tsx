import { useState, useEffect } from 'react';
import { Loader2, AlertCircle, Truck } from 'lucide-react';
import { Link, useRouter } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Logo } from '@/components/Logo';

export function AgentLogin() {
  const { navigate } = useRouter();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && session) navigate('/agent');
  }, [session, loading, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      setError(signInError.message);
      setSubmitting(false);
      return;
    }
    navigate('/agent');
  }

  return (
    <div className="animate-fade-in flex min-h-[70vh] items-center justify-center px-4">
      <div className="card max-w-md w-full p-8">
        <div className="mb-6 text-center">
          <div className="mb-4 flex justify-center">
            <Logo />
          </div>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-forest-100">
            <Truck className="h-6 w-6 text-forest-600" />
          </div>
          <h1 className="text-xl font-semibold text-charcoal-900">Delivery Agent Sign In</h1>
          <p className="mt-1 text-sm text-charcoal-500">Use the login provided by StitchDoor.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label-field">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" required />
          </div>
          <div>
            <label className="label-field">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field" required />
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Sign In
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link to="/" className="text-sm text-charcoal-400 hover:text-forest-600">← Back to site</Link>
        </div>
      </div>
    </div>
  );
}
