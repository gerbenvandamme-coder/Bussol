import { useMemo, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart, MessageSquare, Pin, Reply, Trash2 } from 'lucide-react';
import { Avatar, Button, EmptyState } from '../components/ui';
import { logActivity } from '../lib/data';
import { useApp } from '../lib/store';
import { useCollection } from '../lib/useCollection';
import { cx } from '../lib/util';

interface Tweet {
  id: string;
  author_id: string;
  body: string;
  parent_id: string | null;
  pinned: boolean;
  created_at: string;
}

interface TweetLike {
  id: string;
  tweet_id: string;
  user_id: string;
  created_at: string;
}

const MAX_LENGTH = 500;

function age(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

const byTime = (a: Tweet, b: Tweet) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

/* -------------------------------- Composer -------------------------------- */

function Composer({
  placeholder,
  submitLabel,
  autoFocus = false,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) {
      setError('Write something first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(body);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-2">
      <textarea
        className="field"
        rows={3}
        maxLength={MAX_LENGTH}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-300">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
          {MAX_LENGTH - text.length} left
        </span>
        <div className="flex gap-2">
          {onCancel && <Button onClick={onCancel}>Cancel</Button>}
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Posting…' : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}

/* ---------------------------------- Tweet --------------------------------- */

function TweetItem({
  tweet,
  isReply = false,
  meId,
  likes,
  onLike,
  onPin,
  onDelete,
  onReply,
}: {
  tweet: Tweet;
  isReply?: boolean;
  meId: string;
  likes: TweetLike[];
  onLike: () => void;
  onPin: () => void;
  onDelete: () => void;
  onReply?: () => void;
}) {
  const { profileById } = useApp();
  const author = profileById(tweet.author_id);
  const mine = tweet.author_id === meId;
  const liked = likes.some((l) => l.user_id === meId);

  const action =
    'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-black/5 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-[var(--accent-me)] dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200';

  return (
    <div className="flex items-start gap-3">
      <Avatar profile={author} size={isReply ? 28 : 36} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-sm">
          <span className="font-semibold">{author?.display_name ?? 'Unknown'}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">{age(tweet.created_at)}</span>
          {tweet.pinned && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <Pin size={12} /> Pinned
            </span>
          )}
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{tweet.body}</p>

        <div className="-ml-2 mt-2 flex flex-wrap items-center gap-1">
          <button
            type="button"
            aria-pressed={liked}
            aria-label={liked ? 'Remove like' : 'Like'}
            onClick={onLike}
            className={cx(action, liked && 'text-red-500 dark:text-red-400')}
          >
            <Heart size={14} fill={liked ? 'currentColor' : 'none'} />
            {likes.length > 0 && <span>{likes.length}</span>}
          </button>
          {onReply && (
            <button type="button" onClick={onReply} className={action}>
              <Reply size={14} /> Reply
            </button>
          )}
          {mine && !isReply && (
            <button type="button" aria-pressed={tweet.pinned} onClick={onPin} className={action}>
              <Pin size={14} /> {tweet.pinned ? 'Unpin' : 'Pin'}
            </button>
          )}
          {mine && (
            <button
              type="button"
              aria-label="Delete tweet"
              onClick={onDelete}
              className={cx(action, 'hover:!text-red-500')}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- Pagina --------------------------------- */

export function TweetsPage() {
  const { me } = useApp();
  const tweets = useCollection<Tweet>('tweets', me?.id ?? null);
  const likes = useCollection<TweetLike>('tweet_likes', me?.id ?? null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { topLevel, repliesByParent } = useMemo(() => {
    const replies = new Map<string, Tweet[]>();
    const top: Tweet[] = [];
    for (const t of tweets.rows) {
      if (t.parent_id) {
        const list = replies.get(t.parent_id) ?? [];
        list.push(t);
        replies.set(t.parent_id, list);
      } else {
        top.push(t);
      }
    }
    for (const list of replies.values()) list.sort(byTime);
    top.sort((a, b) => Number(b.pinned) - Number(a.pinned) || byTime(b, a));
    return { topLevel: top, repliesByParent: replies };
  }, [tweets.rows]);

  const likesByTweet = useMemo(() => {
    const map = new Map<string, TweetLike[]>();
    for (const l of likes.rows) {
      const list = map.get(l.tweet_id) ?? [];
      list.push(l);
      map.set(l.tweet_id, list);
    }
    return map;
  }, [likes.rows]);

  if (!me) return null;

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const post = async (body: string) => {
    await tweets.insert({ author_id: me.id, body, parent_id: null, pinned: false });
    try {
      await logActivity(me.id, 'tweet', `${me.display_name} posted a tweet`);
    } catch {
      // De activiteitenfeed is bijzaak: een mislukte log mag de tweet niet blokkeren
    }
  };

  const reply = async (parentId: string, body: string) => {
    await tweets.insert({ author_id: me.id, body, parent_id: parentId, pinned: false });
    setReplyTo(null);
  };

  const toggleLike = (tweetId: string) => {
    const existing = (likesByTweet.get(tweetId) ?? []).find((l) => l.user_id === me.id);
    void run(() => (existing ? likes.remove(existing.id) : likes.insert({ tweet_id: tweetId, user_id: me.id })));
  };

  const askDelete = (tweet: Tweet) => {
    if (window.confirm('Delete this tweet?')) void run(() => tweets.remove(tweet.id));
  };

  return (
    <div className="space-y-5">
      <section aria-label="New tweet" className="glass rounded-3xl p-4">
        <Composer placeholder="What's on your mind?" submitLabel="Tweet" onSubmit={post} />
      </section>

      {(tweets.error || actionError) && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
          {actionError ?? tweets.error}
        </p>
      )}

      {tweets.loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400" role="status">Loading…</p>
      ) : topLevel.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No tweets yet"
          description="Post a quick thought, an idea or an update for your co-founder."
        />
      ) : (
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {topLevel.map((t) => {
              const replies = repliesByParent.get(t.id) ?? [];
              return (
                <motion.li
                  key={t.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  className="glass rounded-3xl p-4"
                >
                  <TweetItem
                    tweet={t}
                    meId={me.id}
                    likes={likesByTweet.get(t.id) ?? []}
                    onLike={() => toggleLike(t.id)}
                    onPin={() => void run(() => tweets.update(t.id, { pinned: !t.pinned }))}
                    onDelete={() => askDelete(t)}
                    onReply={() => setReplyTo(replyTo === t.id ? null : t.id)}
                  />

                  {replies.length > 0 && (
                    <ul className="mt-3 space-y-3 border-l border-black/10 pl-4 dark:border-white/10">
                      {replies.map((r) => (
                        <li key={r.id}>
                          <TweetItem
                            tweet={r}
                            isReply
                            meId={me.id}
                            likes={likesByTweet.get(r.id) ?? []}
                            onLike={() => toggleLike(r.id)}
                            onPin={() => undefined}
                            onDelete={() => askDelete(r)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}

                  {replyTo === t.id && (
                    <div className="mt-3 border-l border-black/10 pl-4 dark:border-white/10">
                      <Composer
                        placeholder="Write a reply…"
                        submitLabel="Reply"
                        autoFocus
                        onSubmit={(body) => reply(t.id, body)}
                        onCancel={() => setReplyTo(null)}
                      />
                    </div>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}