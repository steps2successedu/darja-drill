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

## Match

Match shows one prompt, in English or Darja, with eight options in the other language. The clock starts when the prompt appears, so the time you take is thinking time for that word alone.

- Numbers and words never share a question. Number options are similar in size, and word options include neighbours from the same topic.
- **First tap wrong ("missed"):** the word comes back later in the session. In Drill and Listen it drops a box and becomes due.
- **Right but slow ("slow"):** slower than 1.8× your usual time and at least 2.5 s over it. It comes back sooner and becomes due in Drill and Listen, keeping its box.
- **Right and quick ("clean"):** picking from options is recognition, which is weaker evidence than recall, so a clean answer never pushes Drill or Listen back.
- **Passed:** a word is passed once you've picked it cleanly in **both directions** (English → Darja and Darja → English), with those clean answers on **different days**. Each question asks the direction you still need. A word never comes up both ways in one session. A miss or slow answer wipes that direction's evidence. Passed words come up less often, but still come up.
- **Your usual time** is the median of your last 40 clean answers, kept separately for words, numbers and combos and for each direction.

## Verbs

The Verbs tab gives a verb (*Yekteb*, to write) and an English phrase ("you write (masc)"). You type the whole Darja phrase, which is pronoun, *ra-* form and verb: *nta rak tekteb*. The data is in `vocab.js` (`VOCAB.persons`, `VOCAB.ra`, `VOCAB.verbs`). Each verb lists only the forms its slides give, so persons it doesn't have aren't tested.

- Each verb × person is its own spaced card, so a weak person (say "you (f)") comes back on its own.
- **Marking:** each of the three parts is checked.
  - **Exact:** "Right".
  - **Same consonants and ending, spelt differently** (vowels, doubled letters, ch/sh, 7/h, 9/q, kh/5, y/i): "Right, spelt differently".
  - **A wrong part:** named ("Check the ra- form").
  - **A missing part:** "Needs all three parts".
- You can drill singular, plural or all persons, and switch individual verbs on or off.
- **Current verbs:**
  - *yekteb*, *y9ra* and *ymchi* (Present deck, all 8 persons).
  - *yekdeb* and *ychrab*: the deck lists these without a table, so their forms are built with the slide formula and tagged "Built from the slide formula".
  - *yeskoun*, *yekhdem* and *y7eb* (Deck 1, singular only).
- The pronoun accepts the slides' alternatives: *ntaya*, *ntiya*, *howa*, *hiya*.

## In-session repeats

In Drill and Listen, a missed card comes back 8 cards later and an "Almost" 12 cards later, each at most twice. Longer gaps between attempts give better long-term recall (Pyc & Rawson, 2009).

## Number combos

The **Number combos** topic chip (off by default) makes fresh numbers every session, such as 416, 10,212 or 4,321,555, in both Arabizi and Arabic. They're built in `app.js` (section 4b) from the words in the Numbers topic, using the slide pattern:

- parts go biggest first, joined by *w*;
- below 100 the units come before the tens (*khemsa w tlatin* = 35);
- 11–19 use their own words;
- 2 inside "units w tens" is *tnin* (as in 11,542).

For 11–19 thousand it follows the slides: *7dach nalef* on its own, and *Hdach alf w…* inside a longer number (as in 11,542). Forms the slides don't show are skipped. Combos aren't scheduled into boxes, because they're new every time. They still count towards today's reviews, and a miss comes back later in the session.

## Adding a new week of vocab

In `vocab.js`, add a topic block at the end of `topics`:

```js
{id:'food', name:'Food', week:5, deck:'Deck 5', items:[
  ['Khobz', 'bread', 'خُبْزْ'],
  ...
]}
```

- **Words, phrases and sentence stems only** ("asmou [name]", "I work in [place]"). No full sentences or worked examples: "we'll see each other on Wednesday" and "next year I'll go travelling" stay in the Notebook.
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
