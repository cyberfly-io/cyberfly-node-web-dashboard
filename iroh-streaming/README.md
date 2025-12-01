# iroh-streaming

P2P media streaming over iroh for WebAssembly.

## Overview

This crate provides P2P video/audio streaming capabilities using iroh, designed to work in both native and WebAssembly environments.

Since `iroh-live` uses native dependencies (ffmpeg, nokhwa, xcap) that don't compile to WASM, this module takes a different approach:

1. **P2P Connection**: Uses iroh for establishing P2P connections and data transfer
2. **Media Capture**: Uses browser's native MediaStream API (getUserMedia)
3. **Encoding**: Uses browser's MediaRecorder API
4. **Playback**: Uses browser's HTML5 video/audio elements

## Building for WASM

### Prerequisites

```bash
# Install wasm-bindgen CLI
cargo install wasm-bindgen-cli

# Add WASM target
rustup target add wasm32-unknown-unknown

# Optional: Install cargo-make for build tasks
cargo install cargo-make
```

### Build

```bash
# Using cargo-make
cargo make build

# Or manually
cargo build --target wasm32-unknown-unknown --release
wasm-bindgen --target web --out-dir ../public/wasm target/wasm32-unknown-unknown/release/iroh_streaming.wasm
```

## Building for CLI (testing)

```bash
cargo run --features cli -- publish --name "my-stream"
cargo run --features cli -- subscribe <TICKET>
```

## Usage in Browser

```javascript
import init, { WasmStreamingNode } from './wasm/iroh_streaming.js';

// Initialize WASM
await init();

// Create streaming node
const node = await new WasmStreamingNode();
console.log('Node ID:', node.endpoint_id);

// Start a stream
const ticket = await node.start_stream('my-stream');
console.log('Share this ticket:', ticket);

// Send video frames (from MediaRecorder)
node.send_video_frame(timestamp, isKeyframe, frameData);

// Send audio chunks
node.send_audio_chunk(timestamp, audioData);
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser App                          │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────┐       ┌─────────────────┐         │
│  │  MediaStream    │       │  Video/Audio    │         │
│  │  (getUserMedia) │       │  Elements       │         │
│  └────────┬────────┘       └────────▲────────┘         │
│           │                         │                   │
│           ▼                         │                   │
│  ┌─────────────────┐       ┌────────┴────────┐         │
│  │ MediaRecorder   │       │  Media Decoder  │         │
│  │ (encoding)      │       │  (browser)      │         │
│  └────────┬────────┘       └────────▲────────┘         │
│           │                         │                   │
│           ▼                         │                   │
│  ┌──────────────────────────────────┴──────────────┐   │
│  │            iroh-streaming (WASM)                 │   │
│  │  ┌────────────────────────────────────────────┐ │   │
│  │  │              iroh P2P Connection           │ │   │
│  │  └────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                           │
                           │ P2P (iroh)
                           │
┌─────────────────────────────────────────────────────────┐
│                   Other Peers                           │
└─────────────────────────────────────────────────────────┘
```

## License

MIT OR Apache-2.0
