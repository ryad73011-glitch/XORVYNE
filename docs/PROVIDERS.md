# Provider and capability notes

XORVYNE deliberately separates provider interfaces from the editor model. Provider contracts live in `server/src/providers/types.ts`; provider selection lives in `server/src/providers/registry.ts`. Credentials are read on the server only, from environment variables. There are no keys in the client bundle, IndexedDB project model, or public repository files.

## What is real today

| Capability | Current mode | Notes |
|---|---|---|
| Local media import and storage | Real | Browser validates supported MIME types and a 200 MiB default cap. Original bytes are stored locally in IndexedDB. |
| Media preview | Real where supported | Browser video/audio/image elements play the imported original. Effects are mapped to CSS for the preview. Browser codec support varies by device. |
| Timeline editing | Real | Clip selection, move/reorder, edge trim, split, delete, text clips, audio placement, track mute/hide/lock, presets, transitions, speed/volume/opacity, undo/redo. |
| Save/reopen | Real | Project snapshots and local media are persisted in IndexedDB on the same browser profile/device. No cloud sync. |
| Procedural demo audio | Real demo asset | locally synthesised WAV sound effects and music beds can be placed on a track and included in a real export. They are labelled demo and use no licensed samples. |
| MP4 / WebM export | Real when ffmpeg is available | The local Node server renders using ffmpeg. H.264/AAC MP4 or VP9/Opus WebM. See `npm run setup:ffmpeg`. Export is never presented as complete until a non-empty encoded file exists. |
| AI edit command parsing | Real deterministic parser in demo mode | Supported phrases become structured project operations, are shown as a proposal, and only apply after confirmation. No model call or cost in demo mode. |
| Live command model | Optional, server only | Set both `XORVYNE_COMMAND_ENDPOINT` and `XORVYNE_COMMAND_API_KEY` for an OpenAI-compatible chat endpoint. The response is validated against existing project IDs. Provider errors fall back to the deterministic parser and are labelled accordingly. |
| Text-to-video | Demo storyboard by default; optional live storyboard endpoint | The live adapter validates 1–24 shots and caps combined duration at five minutes. It still does **not** generate footage or import rendered assets. |
| Image-to-video | Demo camera plan | Produces a Ken Burns/camera-move plan. It does **not** synthesize video. |
| Edit-existing analysis | Real metadata + demo plan | Uploaded video metadata (duration, dimensions, fps, audio stream) is probed by ffmpeg; suggested cuts are deterministic demo heuristics, not AI analysis. Temporary upload is local to the server. |
| Speech-to-text, translation, image understanding | Unavailable until configured | No made-up transcripts or translations are returned. Caption requests create editable placeholders and display the missing-provider warning. |

## Export limitations

The renderer is engine-independent from the project schema, but the first export implementation is intentionally bounded:

- One primary video track is rendered. Secondary video tracks are reported as warnings rather than silently composited incorrectly.
- Text clips are rendered through a real ASS subtitle filter with local font fallback; common transitions, audio clips, and the supported effect catalogue are mapped to ffmpeg filters. Unsupported effects are omitted with a warning or mapped to the closest available filter.
- The renderer pads the incoming scene for transitions to preserve the timeline duration; it may clone the last frame during the transition window.
- Very large source videos can take significant time and local disk space. Temporary uploads and output files are removed after the configured retention period (30 minutes by default).
- A static ffmpeg binary is a local platform artefact under `vendor/ffmpeg/` and is git-ignored. No binary is committed.

## Adding a provider

Implement the relevant provider interface in `server/src/providers/`, select it in `registry.ts` only when endpoint + credential are both present, and preserve the mode/detail annotations in the API response. The current generic text-to-video adapter accepts a storyboard contract only; it does not implement vendor-specific async job polling, media download, or project asset import. A real video adapter must follow the vendor's documented API, handle job polling and timeouts, download the resulting media safely, validate file type/size, import the asset into the project pipeline, and only then set `footageGenerated: true`. Keep keys server-side, validate all responses, apply rate limits, and document costs before enabling paid calls.
