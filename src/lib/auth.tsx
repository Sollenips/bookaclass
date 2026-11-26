import { BookOpen, Heart, Music, Star, UserRound } from 'lucide-react';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

export const MIN_PASSWORD_LENGTH = 8;
const PASSWORD_REQUIREMENTS = [/\p{Nd}/u, /[\p{P}\p{S}]/u];

export function isStrongPassword(password: string) {
  return [...password].length >= MIN_PASSWORD_LENGTH && PASSWORD_REQUIREMENTS.every((rule) => rule.test(password));
}

export const PROFILE_AVATARS = [
  { id: 'person', label: 'student.avatarPerson', Icon: UserRound },
  { id: 'star', label: 'student.avatarStar', Icon: Star },
  { id: 'music', label: 'student.avatarMusic', Icon: Music },
  { id: 'book', label: 'student.avatarBook', Icon: BookOpen },
  { id: 'heart', label: 'student.avatarHeart', Icon: Heart },
] as const;

export function profileAvatar(id: unknown) {
  return PROFILE_AVATARS.find((avatar) => avatar.id === id) ?? PROFILE_AVATARS[0];
}

type AuthCtx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  ownedStoreId: string | null;
  roleLoading: boolean;
  roleError: boolean;
  isMember: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, emailRedirectTo?: string, fullName?: string) => Promise<boolean>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<{
    userId: string;
    isAdmin: boolean;
    ownedStoreId: string | null;
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;
  const currentRole = role?.userId === userId ? role : null;
  const roleLoading = Boolean(userId && !currentRole);
  const isAdmin = currentRole?.isAdmin ?? false;
  const ownedStoreId = currentRole?.ownedStoreId ?? null;
  const roleError = currentRole?.failed ?? false;
  const isMember = Boolean(userId && currentRole && !roleError && !isAdmin && !ownedStoreId);

  useEffect(() => {
    if (!userId) {
      setRole(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const [adminRes, ownerRes] = await Promise.all([
          supabase.from('app_admins').select('user_id').eq('user_id', userId).maybeSingle(),
          supabase.from('store_owners').select('store_id').eq('user_id', userId).limit(1).maybeSingle(),
        ]);
        if (cancelled) return;
        const admin = !adminRes.error && Boolean(adminRes.data);
        const storeId = ownerRes.error ? null : ownerRes.data?.store_id ?? null;
        setRole({
          userId,
          isAdmin: admin,
          ownedStoreId: storeId,
          failed: !admin && !storeId && Boolean(adminRes.error || ownerRes.error),
        });
      } catch {
        if (!cancelled) setRole({ userId, isAdmin: false, ownedStoreId: null, failed: true });
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, emailRedirectTo?: string, fullName?: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo, data: fullName ? { full_name: fullName } : undefined } });
    if (error) throw error;
    return Boolean(data.session);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        isAdmin,
        ownedStoreId,
        roleLoading,
        roleError,
        isMember,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
