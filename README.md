# XORVYNE — CREATE BEYOND LIMITS

A premium, mobile-first AI-assisted video creation and editing studio for the web and Android. XORVYNE is an independent project; it does not import, connect to, or modify ATHR.

## Run locally

Requirements: Node.js 20.10+, npm, and Python 3 (only needed to provision the optional ffmpeg binary).

```bash
npm install
npm run setup:ffmpeg   # installs a local, ignored ffmpeg binary for real exports
npm run dev            # Vite web app :5173 + local API :8787
```

Open `http://localhost:5173`. On Android, open the same reachable HTTPS/local-network URL in Chrome and choose **Add to Home screen**. The installable PWA shell and responsive layout are designed for phone screens. Projects and source media are local to each browser profile and do not sync between devices.

The API server can run by itself with `npm run dev:server`. It binds to `127.0.0.1` by default so the unauthenticated API is not exposed to the local network. For a trusted private LAN only, set `HOST=0.0.0.0` explicitly and configure your firewall; do not expose this server directly to the public internet. For a production build, use `npm run build` then `npm start`; the server serves the built client and API on `PORT` (default 8787).

## What's working

- Home dashboard, project library, editor, assistant, asset library, export and settings screens.
- Local import of video, images and audio (200 MiB default per file), with MIME validation, file-size feedback and browser metadata probing.
- IndexedDB project/media storage, autosave, open/reopen, rename, delete, and orphan-media cleanup.
- Engine-independent project model with metadata, assets, tracks, clip timing, effects, transitions, text, project settings and bounded undo/redo history.
- Responsive editor with actual-media preview, multi-track timeline ruler, clip selection, drag-to-move, edge trim, split, delete, text and audio placement, track controls, playhead scrubbing, playback, and inspector.
- Deterministic natural-language edit commands. Changes are previewed as proposals and must be explicitly applied or cancelled. Supports trimming, splitting, deleting, transitions by scene number, cinematic/noir/VHS grades, subtitles as editable placeholders, titles, speed, volume, canvas, and frame rate.
- Searchable effects, transitions, fonts, overlays, templates, procedural WAV sound effects and demo music.
- Real MP4/WebM rendering with local ffmpeg when installed; live progress, download, status and encoder log. No fake “completed” state.
- English, French and Arabic UI; Arabic switches to RTL. Four dark themes, four accents, and reduced motion.
- Installable PWA for Android/desktop.
- Provider-independent server interfaces with honest demo/unavailable modes. No paid API is called automatically.

## Tests and checks

```bash
npm run typecheck
npm test
npm run build
npm run lint
```

The renderer plan, command parser, project operations, IndexedDB save/reopen/history, and media validation are covered by tests. A real render requires ffmpeg and can be smoke-tested through the Export screen.

## AI provider configuration

Copy `.env.example` to `.env` and configure only services you intend to use. Keys are read by the Node server and are never included in browser code. The default command parser is deterministic and offline. Text-to-video generates an editable shot list, not footage. Image-to-video provides camera-move instructions, not synthesized video. Speech-to-text, translation, and image analysis are marked unavailable until a provider adapter is configured. See [`docs/PROVIDERS.md`](docs/PROVIDERS.md).

## Security and privacy

- Imported media is held in browser IndexedDB; it is not uploaded during editing or preview.
- Export uploads the selected project's local media to the same XORVYNE server for rendering, then retains the server-side temporary files only for the configured short retention window.
- Provider credentials live in server environment variables only. Do not put keys in `VITE_*` variables.
- The API binds to localhost by default. LAN exposure is opt-in because the local API does not currently implement user authentication.
- Uploaded media types and size are validated; export filenames are sanitised; temporary directories are isolated per job.
- Local project data has no cloud backup. Browser storage can be cleared by the user or browser, so export important work.

## Technology

TypeScript + React 19 + Vite for the client, Express 5 + Zod for the optional local server, Zustand for client state, IndexedDB for offline project/media storage, and an engine-independent TypeScript project model shared by the editor and server renderer. The rendering adapter translates that model to ffmpeg only at export time.
