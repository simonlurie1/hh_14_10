# Heart Readings — practice interview exercise

A small React Native (Expo + Redux Toolkit) app with one screen: a user's blood pressure history.
Readings come from two places: a connected Bluetooth BP monitor (simulated) and manual entry.

## Your task

Product and support have collected these reports from users:

> "I switched to 7 days and I'm seeing readings from two months ago."
> "After I sync my cuff, some readings show up two or three times. And sometimes the new readings disappear later."
> "The app gets stuck on 'Loading readings…' forever."
> "A reading I took right after midnight shows under the wrong day."
> "The order of my readings looks random."
> "My 150/75 reading shows a yellow dot. My doctor says that's high."
> "Scrolling the 90-day view is laggy, and tapping a row feels slow."
> "I tapped Save twice and got two readings."

1. **Find what's wrong.** Run the app, reproduce issues, read the code. There are more problems than the list above.
2. **Rank them.** Write down every problem you find and order them by importance. Be ready to explain why.
3. **Fix the most important issue** (or two, if time allows). Keep the fix focused.
4. **Verify your fix** and be ready to show how you verified it.
5. **Explain how you would design the rest** — you don't need to code everything.

Put your notes in a `NOTES.md` file: problem list, ranking + reasoning, what you fixed, how you verified, what you'd do next.

**Time box:** 60–90 minutes.

## Ground rules

- `src/api/mockServer.ts` is "the backend" and `src/device/bpMonitor.ts` is "the hardware".
  Read them to understand how they behave (latency, failures, what the device sends),
  but treat them as things you **can't change**. The bugs are in the app code.
- Times are stored as UTC ISO strings. The user expects to see their **local** day and time.

## Running it

```bash
npm install
npx expo start
```

Then press `i` (iOS simulator), `a` (Android emulator), `w` (web), or scan the QR code with **Expo Go** on your phone.
If Expo Go complains about the SDK version, run `npx expo install --fix`.

Useful while debugging:
- Shake the device / `Cmd+D` / `Ctrl+M` → **Perf Monitor** and **Open DevTools** (React Profiler).
- Watch the Metro terminal for `[api]` logs — they show every request.
- `npm run typecheck` runs TypeScript.

## Tips

- Tap **🩺 Measure on cuff** a couple of times, then **🔄 Sync monitor** a few times.
- Switch quickly between `90d` and `7d`.
- Leave the screen open for a minute and watch the logs.
