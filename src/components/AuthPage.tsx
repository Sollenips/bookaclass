import { useState } from 'react';
import { CalendarCheck, Loader2, AlertCircle } from 'lucide-react';
import { isStrongPassword, MIN_PASSWORD_LENGTH, useAuth } from '@/lib/auth';
import { signInAsAdmin } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';

type Props = {
  onBack: () => void;
  student?: boolean;
  adminOnly?: boolean;
  onAuthenticated?: () => void;
};

type Mode = 'signIn' | 'signUp';


export function AuthPage({ onBack, student = false, adminOnly = false, onAuthenticated }: Props) {
  const { signIn, signUp } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>(student ? 'signUp' : 'signIn');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [ageGroup, setAgeGroup] = useState('');
  const [guardianConfirmed, setGuardianConfirmed] = useState(false);
  const isSignUp = !adminOnly && mode === 'signUp';
  const studentSignup = student && isSignUp;
  const mayEnterDetails = !studentSignup || ageGroup === 'adult' || (ageGroup === 'minor' && guardianConfirmed);
  const strongPassword = isStrongPassword(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!mayEnterDetails || (isSignUp && !strongPassword)) return;

    setSubmitting(true);
    try {
      if (isSignUp) {
        const callback = new URL(import.meta.env.BASE_URL, window.location.origin);
        callback.searchParams.set('account', 'student');
        const signedIn = await signUp(email.trim(), password, student ? callback.href : undefined, student ? fullName.trim() : undefined);
        if (signedIn) onAuthenticated?.();
        else if (student) setAwaitingConfirmation(true);
      } else {
        await (adminOnly ? signInAsAdmin : signIn)(email.trim(), password);
        onAuthenticated?.();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (isSignUp) {
        setError(t('auth.errorSignUp'));
      } else if (msg.includes('Invalid login')) {
        setError(t('auth.errorInvalid'));
      } else {
        setError(t('auth.errorGeneric'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 bg-stone-50">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="bg-teal-600 px-6 py-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center mx-auto mb-4">
              <CalendarCheck className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">
              {isSignUp ? t(student ? 'student.signup' : 'auth.signUpTitle') : t('auth.signIn')}
            </h1>
            {studentSignup && <p className="mt-2 text-sm leading-relaxed text-teal-50">{t('student.benefits')}</p>}
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {isSignUp && !student && (
              <p className="text-sm text-stone-500 bg-stone-50 border border-stone-200 rounded-xl p-3">
                {t('auth.signUpHelp')}
              </p>
            )}

            {studentSignup && (
              <>
                <label className="block text-sm font-medium text-stone-700">
                  {t('student.ageQuestion')} <span aria-hidden="true" className="text-rose-600">*</span>
                  <select required disabled={submitting} value={ageGroup}
                    onChange={(event) => {
                      setAgeGroup(event.target.value);
                      setGuardianConfirmed(false);
                      setFullName('');
                      setEmail('');
                      setPassword('');
                      setError(null);
                      setAwaitingConfirmation(false);
                    }}
                    className="mt-1.5 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5"
                  >
                    <option value="">{t('student.ageChoose')}</option>
                    <option value="adult">{t('student.ageAdult')}</option>
                    <option value="minor">{t('student.ageMinor')}</option>
                  </select>
                </label>
                {ageGroup === 'minor' && (
                  <div className="space-y-3 rounded-xl border border-teal-100 bg-teal-50 p-3 text-sm text-teal-900">
                    <p>{t('student.guardianSignup')}</p>
                    <label className="flex items-start gap-2 font-medium">
                      <input type="checkbox" checked={guardianConfirmed} disabled={submitting} required
                        onChange={(event) => setGuardianConfirmed(event.target.checked)} className="mt-0.5 accent-teal-700" />
                      {t('student.guardianCheck')}
                    </label>
                  </div>
                )}
              </>
            )}

            <fieldset disabled={!mayEnterDetails || submitting} hidden={!mayEnterDetails} className="space-y-4">
              {student && isSignUp && (
                <label className="block text-sm font-medium text-stone-700">
                  {t(ageGroup === 'minor' ? 'req.guardianName' : 'student.fullName')} <span aria-hidden="true" className="text-rose-600">*</span>
                  <input
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                    pattern=".*\S.*"
                    maxLength={100}
                    className="mt-1.5 w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-stone-800 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                  />
                </label>
              )}

              <div>
                <label htmlFor="auth-email" className="block text-sm font-medium text-stone-700 mb-1.5">
                  {t('auth.email')} <span aria-hidden="true" className="text-rose-600">*</span>
                </label>
                <input
                  type="email"
                  id="auth-email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="w-full px-4 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-stone-800 placeholder:text-stone-400 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition-all text-sm"
                />
              </div>

              <div>
                <label htmlFor="auth-password" className="block text-sm font-medium text-stone-700 mb-1.5">
                  {t('auth.password')} <span aria-hidden="true" className="text-rose-600">*</span>
                </label>
                <input
                  type="password"
                  id="auth-password"
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={isSignUp ? MIN_PASSWORD_LENGTH : undefined}
                  aria-describedby={isSignUp ? "auth-password-rules auth-password-strength" : undefined}
                  className="w-full px-4 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-stone-800 placeholder:text-stone-400 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition-all text-sm"
                />
                {isSignUp && (
                  <div className="mt-2 space-y-1 text-xs">
                    <p id="auth-password-rules" className="text-stone-600">{t('auth.password.rules')}</p>
                    <p id="auth-password-strength" role="status" className={strongPassword ? 'font-semibold text-teal-700' : 'font-semibold text-rose-700'}>
                      {password && t(strongPassword ? 'auth.password.strong' : 'auth.password.weak')}
                    </p>
                  </div>
                )}
              </div>
            </fieldset>

            {awaitingConfirmation && (
              <p role="status" className="rounded-xl bg-teal-50 p-3 text-sm text-teal-800">{t('student.confirm')}</p>
            )}
            {error && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !mayEnterDetails || (isSignUp && !strongPassword)}
              className="w-full py-3.5 rounded-xl bg-teal-600 text-white font-semibold text-base hover:bg-teal-700 active:scale-[0.98] transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                isSignUp ? t('auth.signUpBtn') : t('auth.signInBtn')
              )}
            </button>
          </form>

          <div className="px-6 pb-6 text-center space-y-3">
            {!adminOnly && (
              <button
                onClick={() => {
                  setError(null);
                  setAwaitingConfirmation(false);
                  setMode(isSignUp ? 'signIn' : 'signUp');
                }}
                className="text-sm font-medium text-teal-700 hover:text-teal-800 transition-colors"
              >
                {isSignUp ? t('auth.haveAccount') : t('auth.needAccount')}
              </button>
            )}
            <div>
              <button
                onClick={onBack}
                className="text-sm text-stone-400 hover:text-stone-600 transition-colors"
              >
                {t('admin.backToSite')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
