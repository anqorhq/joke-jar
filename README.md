# 🫙 Joke Jar

A personal joke library that works offline on Mac, iPad and iPhone.

- 🎲 Pick a random joke (every joke plays once before any repeats), or choose one from the library
- 🔊 Read a joke aloud, with a pause before the punchline
- 🎧 Hands-free mode reads jokes one after another, with pause, skip and stop
- ★ Favourites, categories, search, and source links (YouTube timestamps supported)
- ✏️ Add, edit and delete jokes (with undo)
- ⬇︎⬆︎ Export and import JSON to back up or copy jokes between devices

It's plain HTML, CSS and JavaScript with no build step. Jokes are stored in IndexedDB on each device, and a service worker caches the app so it works offline.

## Install on your devices

1. Open the GitHub Pages URL once while online.
2. Install it:
   - **iPhone / iPad:** in Safari, tap Share → **Add to Home Screen**
   - **Mac:** in Safari, choose File → **Add to Dock** (or use Chrome's install button in the address bar)
3. From then on it works fully offline.

Each device keeps its own jokes. To copy them, go to **Settings → Export** on one device, then **Import** on the other. AirDrop or iCloud Drive work well for moving the file. When you import, jokes you already have are skipped.

## Import format

```json
[
  { "setup": "Why don't skeletons fight?", "punch": "They don't have the guts.",
    "cat": "Puns", "source": "https://youtu.be/VIDEO_ID?t=95", "fav": false }
]
```
Only `setup` is required. The aliases `joke`/`text`, `punchline`, `category` and `url` are also accepted.

## Develop

```bash
python3 -m http.server 8080
```
Then open http://localhost:8080.

When you deploy changes, bump `VERSION` in both `sw.js` and `app.js` so devices refresh the offline cache. Put personal joke files in `private/`, which is git-ignored.

Icons are generated with `swift tools/make-icons.swift`.
