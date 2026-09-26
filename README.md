# Darja Drill

Spaced practice for every Algerian Darja word from André's lessons, mixed across all decks.

Live site: https://steps2successedu.github.io/darja-drill/

## What it does

- **Drill.** You see English or Darja, say the answer out loud, reveal it and mark yourself (Missed / Almost / Got it).
- **Listen.** A device voice reads the Darja from vowel-marked Arabic script, and you type the English. Answers are marked leniently: casual words (mum, auntie, dad's side), typos and word order are all fine. Opposite words (maternal/paternal, next/last) and the wrong person (his/your) are caught.
- **Scheduling.** Cards move through five boxes: same day, 1 day, 3 days, 7 days, 21 days. A miss goes back to box 1 and comes back again in the same session. Nothing ever retires. Topics take turns so no single topic can flood a session. The two directions of one word never land in the same session.
- **Sync.** Progress is saved on each device. It also syncs through Supabase (project `darja-drill`) under a private sync code, so there is no login.
- **Offline.** The site works offline and can be added to the home screen.

## Files

| File | Purpose |
|---|---|
| `vocab.js` | **The only file that changes each week.** All vocab, by topic. |
| `app.js` | Scheduler, drill, listening, marking, progress, sync |
| `index.html`, `style.css` | Page and styling (light, dark, auto) |
| `config.js` | Supabase URL and publishable key (public by design) |
| `sw.js`, `manifest.json`, `icon-*.png` | Offline support and home-screen install |

## Adding a new week of vocab

In `vocab.js`, add a topic block at the end of `topics`:

```js
{id:'food', name:'Food', week:5, deck:'Deck 5', items:[
  ['Khobz', 'bread', 'خُبْزْ'],
  ...
]}
```

- `week` must be one higher than the current highest. The newest week's new cards are introduced first.
- Each item is `[darja, english, arabic, alt, flags]`.
  - In the English, ` — ` or ` · ` separates accepted answers. `— to a man` / `— to a woman` shows who the question is addressed to.
  - Arabic must be vowel-marked. **Always put the shadda (ّ) on doubled letters.** Without it the voice can pick the wrong word; for example, unmarked عمي can be read as "blind" instead of "my uncle".
  - Flags: `x` means not from the slides, `u` means the Arabic spelling is unsure (listed in Settings for the teacher to check).
- Change `updated:` to today's date.
- Existing progress is kept. New topics are switched on automatically on every device.

## Sync backend

Supabase project `darja-drill` (ref `mdnzzuftjokczyhuszyf`, Sydney) has:

- a table `drill_progress(key_hash, data, updated_at)`. RLS is on and there are no policies, so the table can't be read directly.
- `get_progress(p_key)` and `save_progress(p_key, p_data)`. These are security-definer functions keyed by the SHA-256 of the sync code. The code is about 120 bits of randomness.

Free Supabase projects pause after about a week of inactivity. Restore it from the Supabase dashboard if sync stops.
