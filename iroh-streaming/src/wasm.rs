//! WASM bindings for the streaming node
//!
//! This module exposes the streaming node functionality to JavaScript
//! using wasm-bindgen. Based on browser-chat example.

use std::collections::BTreeSet;
use std::sync::{Arc, Mutex};

use anyhow::Result;
use js_sys::Uint8Array;
use n0_future::StreamExt;
use serde::{Deserialize, Serialize};
use tracing::level_filters::LevelFilter;
use tracing_subscriber_wasm::MakeConsoleWriter;
use wasm_bindgen::{JsError, JsValue, prelude::wasm_bindgen};
use wasm_streams::ReadableStream;
use web_sys::console;

use crate::node::{self, StreamTicket, StreamEvent, StreamQuality};

#[wasm_bindgen(start)]
fn start() {
    console_error_panic_hook::set_once();

    let _ = tracing_subscriber::fmt()
        .with_max_level(LevelFilter::DEBUG)
        .with_writer(
            MakeConsoleWriter::default().map_trace_level_to(tracing::Level::DEBUG),
        )
        .without_time()
        .with_ansi(false)
        .try_init();

    tracing::info!("iroh-streaming WASM module initialized");
}

/// WASM wrapper for StreamingNode
#[wasm_bindgen]
pub struct StreamingNode(node::StreamingNode);

#[wasm_bindgen]
impl StreamingNode {
    /// Spawn a new streaming node
    pub async fn spawn() -> Result<StreamingNode, JsError> {
        console::log_1(&"[WASM] Spawning streaming node...".into());
        let inner = node::StreamingNode::spawn(None)
            .await
            .map_err(to_js_err)?;
        console::log_1(&"[WASM] Streaming node spawned".into());
        Ok(Self(inner))
    }

    /// Get the endpoint ID as a string
    pub fn endpoint_id(&self) -> String {
        self.0.endpoint_id().to_string()
    }

    /// Create a new stream (as broadcaster)
    pub async fn create_stream(&self, name: String) -> Result<Stream, JsError> {
        console::log_1(&format!("[WASM] Creating stream with name: {}", name).into());
        let ticket = StreamTicket::new_random();
        let (sender, receiver) = self.0.join(&ticket, name).await.map_err(to_js_err)?;
        console::log_1(&"[WASM] Stream created".into());
        Ok(Stream::new(sender, receiver, ticket, self.0.endpoint_id()))
    }

    /// Join an existing stream (as viewer)
    pub async fn join_stream(&self, ticket_str: String, name: String) -> Result<Stream, JsError> {
        console::log_1(&format!("[WASM] Joining stream: {}", &ticket_str[..20.min(ticket_str.len())]).into());
        let ticket = StreamTicket::deserialize_ticket(&ticket_str).map_err(to_js_err)?;
        console::log_1(&format!("[WASM] Ticket parsed, bootstrap peers: {}", ticket.bootstrap.len()).into());
        console::log_1(&"[WASM] Calling node.join()...".into());
        let (sender, receiver) = self.0.join(&ticket, name).await.map_err(to_js_err)?;
        console::log_1(&"[WASM] Stream joined".into());
        Ok(Stream::new(sender, receiver, ticket, self.0.endpoint_id()))
    }

    /// Shutdown the node
    pub async fn shutdown(&self) {
        self.0.shutdown().await;
    }

    /// Get video constraints for a quality preset
    pub fn get_quality_constraints(quality: String) -> String {
        let q = match quality.as_str() {
            "low" => StreamQuality::Low,
            "medium" => StreamQuality::Medium,
            "high" => StreamQuality::High,
            "ultra" => StreamQuality::Ultra,
            _ => StreamQuality::Medium,
        };

        let (width, height, fps) = q.video_constraints();
        let audio_bitrate = q.audio_bitrate();

        serde_json::json!({
            "width": width,
            "height": height,
            "framerate": fps,
            "audioBitrate": audio_bitrate
        }).to_string()
    }
}

type StreamReceiver = wasm_streams::readable::sys::ReadableStream;

/// WASM wrapper for a Stream (topic)
#[wasm_bindgen]
pub struct Stream {
    topic_id: String,
    me: String,
    bootstrap: BTreeSet<String>,
    neighbors: Arc<Mutex<BTreeSet<String>>>,
    sender: StreamSender,
    receiver: StreamReceiver,
    ticket: StreamTicket,
}

impl Stream {
    fn new(
        sender: node::StreamSender,
        receiver: n0_future::boxed::BoxStream<Result<StreamEvent, anyhow::Error>>,
        ticket: StreamTicket,
        me: iroh::EndpointId,
    ) -> Self {
        let topic_id = ticket.topic_id.to_string();
        let bootstrap: BTreeSet<String> = ticket.bootstrap.iter().map(|e| e.to_string()).collect();
        let neighbors = Arc::new(Mutex::new(BTreeSet::new()));
        let neighbors2 = neighbors.clone();

        // Convert receiver to JS ReadableStream using try_unfold pattern
        let receiver_stream = n0_future::stream::try_unfold(receiver, {
            let neighbors = neighbors2.clone();
            move |mut receiver| {
                let neighbors = neighbors.clone();
                async move {
                    loop {
                        let Some(event) = receiver.next().await else {
                            tracing::info!("[WASM] Receiver stream ended");
                            return Ok(None);
                        };
                        
                        tracing::debug!("[WASM] Received event from stream");
                        
                        match event {
                            Ok(StreamEvent::NeighborUp { endpoint_id }) => {
                                let id = endpoint_id.to_string();
                                tracing::info!("[WASM] NeighborUp: {}", id);
                                neighbors.lock().unwrap().insert(id.clone());
                                let js_event = WasmStreamEvent::NeighborUp { endpoint_id: id };
                                let value = serde_wasm_bindgen::to_value(&js_event).unwrap();
                                return Ok(Some((value, receiver)));
                            }
                            Ok(StreamEvent::NeighborDown { endpoint_id }) => {
                                let id = endpoint_id.to_string();
                                tracing::info!("[WASM] NeighborDown: {}", id);
                                neighbors.lock().unwrap().remove(&id);
                                let js_event = WasmStreamEvent::NeighborDown { endpoint_id: id };
                                let value = serde_wasm_bindgen::to_value(&js_event).unwrap();
                                return Ok(Some((value, receiver)));
                            }
                            Ok(StreamEvent::Presence { from, name, sent_timestamp }) => {
                                tracing::info!("[WASM] Presence from {}: {}", from, name);
                                let js_event = WasmStreamEvent::Presence {
                                    from: from.to_string(),
                                    name,
                                    sent_timestamp,
                                };
                                let value = serde_wasm_bindgen::to_value(&js_event).unwrap();
                                return Ok(Some((value, receiver)));
                            }
                            Ok(StreamEvent::MediaChunk { from, data, sequence, timestamp }) => {
                                tracing::info!("[WASM] MediaChunk from {} seq={} size={}", from, sequence, data.len());
                                let js_event = WasmStreamEvent::MediaChunk {
                                    from: from.to_string(),
                                    data,
                                    sequence,
                                    timestamp,
                                };
                                let value = serde_wasm_bindgen::to_value(&js_event).unwrap();
                                return Ok(Some((value, receiver)));
                            }
                            Ok(StreamEvent::Signal { from, data, timestamp }) => {
                                tracing::info!("[WASM] Signal from {} size={}", from, data.len());
                                let js_event = WasmStreamEvent::Signal {
                                    from: from.to_string(),
                                    data,
                                    timestamp,
                                };
                                let value = serde_wasm_bindgen::to_value(&js_event).unwrap();
                                return Ok(Some((value, receiver)));
                            }
                            Ok(StreamEvent::Lagged) => {
                                tracing::warn!("[WASM] Lagged event");
                                let js_event = WasmStreamEvent::Lagged;
                                let value = serde_wasm_bindgen::to_value(&js_event).unwrap();
                                return Ok(Some((value, receiver)));
                            }
                            Err(e) => {
                                tracing::warn!("[WASM] Stream error: {:?}", e);
                                continue;
                            }
                        }
                    }
                }
            }
        });

        let js_receiver = ReadableStream::from_stream(receiver_stream).into_raw();

        Self {
            topic_id,
            me: me.to_string(),
            bootstrap,
            neighbors,
            sender: StreamSender(sender),
            receiver: js_receiver,
            ticket,
        }
    }
}

#[wasm_bindgen]
impl Stream {
    #[wasm_bindgen(getter)]
    pub fn sender(&self) -> StreamSender {
        self.sender.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn receiver(&mut self) -> StreamReceiver {
        self.receiver.clone()
    }

    /// Get the stream ticket for sharing
    pub fn ticket(&self, opts: JsValue) -> Result<String, JsError> {
        let opts: TicketOpts = serde_wasm_bindgen::from_value(opts)?;
        let mut ticket = StreamTicket::new(self.ticket.topic_id);
        
        if opts.include_myself {
            ticket.bootstrap.insert(self.me.parse().map_err(to_js_err)?);
        }
        if opts.include_bootstrap {
            ticket.bootstrap.extend(self.ticket.bootstrap.iter().cloned());
        }
        if opts.include_neighbors {
            let neighbors = self.neighbors.lock().unwrap();
            for n in neighbors.iter() {
                if let Ok(id) = n.parse() {
                    ticket.bootstrap.insert(id);
                }
            }
        }
        
        Ok(ticket.serialize_ticket())
    }

    /// Get the topic ID
    pub fn id(&self) -> String {
        self.topic_id.clone()
    }

    /// Get current neighbors
    pub fn neighbors(&self) -> Vec<String> {
        self.neighbors.lock().unwrap().iter().cloned().collect()
    }
}

/// WASM wrapper for StreamSender
#[wasm_bindgen]
#[derive(Clone)]
pub struct StreamSender(node::StreamSender);

#[wasm_bindgen]
impl StreamSender {
    /// Broadcast a media chunk
    pub async fn broadcast_chunk(&self, data: Uint8Array, sequence: u32) -> Result<(), JsError> {
        let data_vec = uint8array_to_vec(&data);
        console::log_1(&format!("[WASM] Broadcasting chunk {} ({} bytes)", sequence, data_vec.len()).into());
        self.0.broadcast_chunk(data_vec, sequence as u64).await.map_err(to_js_err)?;
        console::log_1(&format!("[WASM] Chunk {} broadcast complete", sequence).into());
        Ok(())
    }

    /// Send presence announcement
    pub async fn send_presence(&self) -> Result<(), JsError> {
        self.0.send_presence().await.map_err(to_js_err)
    }

    /// Send signaling payload
    pub async fn send_signal(&self, data: Uint8Array) -> Result<(), JsError> {
        let data_vec = uint8array_to_vec(&data);
        console::log_1(&format!("[WASM] Sending signal ({} bytes)", data_vec.len()).into());
        self.0.send_signal(data_vec).await.map_err(to_js_err)
    }

    /// Set the broadcaster name
    pub fn set_name(&self, name: String) {
        self.0.set_name(name);
    }
}

/// Stream events for JS
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum WasmStreamEvent {
    NeighborUp { endpoint_id: String },
    NeighborDown { endpoint_id: String },
    Presence {
        from: String,
        name: String,
        sent_timestamp: u64,
    },
    MediaChunk {
        from: String,
        data: Vec<u8>,
        sequence: u64,
        timestamp: u64,
    },
    Signal {
        from: String,
        data: Vec<u8>,
        timestamp: u64,
    },
    Lagged,
}

/// Ticket options
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TicketOpts {
    pub include_myself: bool,
    pub include_bootstrap: bool,
    pub include_neighbors: bool,
}

fn to_js_err(err: impl Into<anyhow::Error>) -> JsError {
    let err: anyhow::Error = err.into();
    JsError::new(&err.to_string())
}

fn uint8array_to_vec(data: &Uint8Array) -> Vec<u8> {
    let mut buffer = vec![0u8; data.length() as usize];
    data.copy_to(&mut buffer[..]);
    buffer
}

pub fn vec_to_uint8array(bytes: &[u8]) -> Uint8Array {
    let array = Uint8Array::new_with_length(bytes.len() as u32);
    array.copy_from(bytes);
    array
}
