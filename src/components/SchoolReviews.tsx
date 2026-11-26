import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';

export type SchoolReview = {
  id: string;
  store_id: string;
  author_name: string;
  rating: number;
  comment: string | null;
  hidden: boolean;
};

export function useSchoolReviews(admin: boolean) {
  const [reviews, setReviews] = useState<SchoolReview[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    void supabase.from('school_reviews').select('id,store_id,author_name,rating,comment,hidden')
      .order('created_at', { ascending: false }).then(({ data, error }) => {
        if (!current) return;
        setFailed(Boolean(error));
        setReviews(data ?? []);
      });
    return () => { current = false; };
  }, [admin]);
  return { reviews, setReviews, failed };
}

export function SchoolReviewRating({ ratings }: { ratings: number[] }) {
  const { t, lang } = useI18n();
  if (!ratings.length) return null;
  const average = ratings.reduce((sum, item) => sum + item, 0) / ratings.length;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-stone-700">
      <Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden="true" />
      <span>{average.toLocaleString(lang, { maximumFractionDigits: 1 })} / 5 · {ratings.length} {t(ratings.length === 1 ? 'reviews.one' : 'reviews.title')}</span>
    </span>
  );
}

export function SchoolReviews({ reviews, failed, admin, onModerate }: {
  reviews: SchoolReview[];
  failed: boolean;
  admin: boolean;
  onModerate: (id: string, hidden: boolean) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(false);
  const visible = reviews.filter((review) => !review.hidden);

  return (
    <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{t('reviews.title')}</h2>
        <SchoolReviewRating ratings={visible.map(({ rating }) => rating)} />
      </div>
      {failed || error ? <p role="alert" className="mt-2 text-sm text-rose-700">{t('reviews.error')}</p> : null}
      {!failed && reviews.length === 0 && <p className="mt-2 text-sm text-stone-500">{t('reviews.empty')}</p>}
      <ul className="divide-y divide-stone-200">
        {reviews.map((review) => (
          <li key={review.id} className="py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <strong>{review.author_name}</strong>
              <span className="text-amber-800">★ {review.rating} / 5</span>
              <span className="text-xs text-teal-700">{t('reviews.verified')}</span>
              {review.hidden && <span className="text-xs text-stone-500">{t('reviews.hidden')}</span>}
            </div>
            {review.comment && <p className="mt-1 whitespace-pre-wrap break-words text-stone-700">{review.comment}</p>}
            {admin && (
              <button type="button" disabled={!!busy} className="mt-2 text-sm font-medium text-teal-800 underline"
                onClick={async () => {
                  setBusy(review.id);
                  setError(!(await onModerate(review.id, !review.hidden)));
                  setBusy('');
                }}>
                {t(review.hidden ? 'reviews.restore' : 'reviews.hide')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SchoolReviewForm({ code }: { code: string }) {
  const { t } = useI18n();
  const [rating, setRating] = useState('');
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  return (
    <div className="mx-auto my-12 max-w-lg px-4">
      <form className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!rating || status === 'saving') return;
          setStatus('saving');
          const { error } = await supabase.rpc('submit_school_review', {
            invite: code, stars: Number(rating), review_comment: comment,
          });
          setStatus(error ? 'error' : 'saved');
        }}>
        <h1 className="text-xl font-bold">{t('reviews.write')}</h1>
        {status === 'saved' ? <p role="status">{t('reviews.thanks')}</p> : (
          <>
            <label className="grid gap-1 text-sm font-medium">
              {t('reviews.rating')}
              <select required value={rating} onChange={(event) => setRating(event.target.value)}
                className="rounded-lg border border-stone-300 p-2">
                <option value="">{t('reviews.chooseRating')}</option>
                {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} / 5</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {t('reviews.comment')}
              <textarea rows={4} maxLength={600} value={comment} onChange={(event) => setComment(event.target.value)}
                className="rounded-lg border border-stone-300 p-2" />
            </label>
            <p className="text-xs text-stone-600">{t('reviews.publicNotice')}</p>
            {status === 'error' && <p role="alert" className="text-sm text-rose-700">{t('reviews.linkError')}</p>}
            <button type="submit" disabled={status === 'saving'} className="rounded-xl bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50">
              {t('reviews.submit')}
            </button>
          </>
        )}
        <a className="block text-sm text-teal-800 underline" href={window.location.pathname}>{t('reviews.back')}</a>
      </form>
    </div>
  );
}
