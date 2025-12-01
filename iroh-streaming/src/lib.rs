//! P2P media streaming over iroh-gossip for WebAssembly
//!
//! This module provides real-time P2P streaming using gossip protocol.
//! Based on browser-chat example from iroh-examples.

pub mod node;
pub mod wasm;

pub use node::*;
