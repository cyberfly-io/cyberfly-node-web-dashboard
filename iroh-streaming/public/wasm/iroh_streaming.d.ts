/* tslint:disable */
/* eslint-disable */
export function start(): void;
/**
 * The `ReadableStreamType` enum.
 *
 * *This API requires the following crate features to be activated: `ReadableStreamType`*
 */
type ReadableStreamType = "bytes";
export class IntoUnderlyingByteSource {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  start(controller: ReadableByteStreamController): void;
  pull(controller: ReadableByteStreamController): Promise<any>;
  cancel(): void;
  readonly type: ReadableStreamType;
  readonly autoAllocateChunkSize: number;
}
export class IntoUnderlyingSink {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  write(chunk: any): Promise<any>;
  close(): Promise<any>;
  abort(reason: any): Promise<any>;
}
export class IntoUnderlyingSource {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  pull(controller: ReadableStreamDefaultController): Promise<any>;
  cancel(): void;
}
/**
 * WASM wrapper for a Stream (topic)
 */
export class Stream {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Get the stream ticket for sharing
   */
  ticket(opts: any): string;
  /**
   * Get the topic ID
   */
  id(): string;
  /**
   * Get current neighbors
   */
  neighbors(): string[];
  readonly sender: StreamSender;
  readonly receiver: ReadableStream;
}
/**
 * WASM wrapper for StreamSender
 */
export class StreamSender {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Broadcast a media chunk
   */
  broadcast_chunk(data: Uint8Array, sequence: number): Promise<void>;
  /**
   * Send presence announcement
   */
  send_presence(): Promise<void>;
  /**
   * Send signaling payload
   */
  send_signal(data: Uint8Array): Promise<void>;
  /**
   * Set the broadcaster name
   */
  set_name(name: string): void;
}
/**
 * WASM wrapper for StreamingNode
 */
export class StreamingNode {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Spawn a new streaming node
   */
  static spawn(): Promise<StreamingNode>;
  /**
   * Get the endpoint ID as a string
   */
  endpoint_id(): string;
  /**
   * Create a new stream (as broadcaster)
   */
  create_stream(name: string): Promise<Stream>;
  /**
   * Join an existing stream (as viewer)
   */
  join_stream(ticket_str: string, name: string): Promise<Stream>;
  /**
   * Shutdown the node
   */
  shutdown(): Promise<void>;
  /**
   * Get video constraints for a quality preset
   */
  static get_quality_constraints(quality: string): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly start: () => void;
  readonly __wbg_streamingnode_free: (a: number, b: number) => void;
  readonly streamingnode_spawn: () => any;
  readonly streamingnode_endpoint_id: (a: number) => [number, number];
  readonly streamingnode_create_stream: (a: number, b: number, c: number) => any;
  readonly streamingnode_join_stream: (a: number, b: number, c: number, d: number, e: number) => any;
  readonly streamingnode_shutdown: (a: number) => any;
  readonly streamingnode_get_quality_constraints: (a: number, b: number) => [number, number];
  readonly __wbg_stream_free: (a: number, b: number) => void;
  readonly stream_sender: (a: number) => number;
  readonly stream_receiver: (a: number) => any;
  readonly stream_ticket: (a: number, b: any) => [number, number, number, number];
  readonly stream_id: (a: number) => [number, number];
  readonly stream_neighbors: (a: number) => [number, number];
  readonly __wbg_streamsender_free: (a: number, b: number) => void;
  readonly streamsender_broadcast_chunk: (a: number, b: any, c: number) => any;
  readonly streamsender_send_presence: (a: number) => any;
  readonly streamsender_send_signal: (a: number, b: any) => any;
  readonly streamsender_set_name: (a: number, b: number, c: number) => void;
  readonly __wbg_intounderlyingsource_free: (a: number, b: number) => void;
  readonly intounderlyingsource_pull: (a: number, b: any) => any;
  readonly intounderlyingsource_cancel: (a: number) => void;
  readonly __wbg_intounderlyingbytesource_free: (a: number, b: number) => void;
  readonly intounderlyingbytesource_type: (a: number) => number;
  readonly intounderlyingbytesource_autoAllocateChunkSize: (a: number) => number;
  readonly intounderlyingbytesource_start: (a: number, b: any) => void;
  readonly intounderlyingbytesource_pull: (a: number, b: any) => any;
  readonly intounderlyingbytesource_cancel: (a: number) => void;
  readonly __wbg_intounderlyingsink_free: (a: number, b: number) => void;
  readonly intounderlyingsink_write: (a: number, b: any) => any;
  readonly intounderlyingsink_close: (a: number) => any;
  readonly intounderlyingsink_abort: (a: number, b: any) => any;
  readonly ring_core_0_17_14__bn_mul_mont: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly wasm_bindgen__convert__closures_____invoke__h74bccd413e32aa43: (a: number, b: number) => void;
  readonly wasm_bindgen__closure__destroy__hf637be9a6b273289: (a: number, b: number) => void;
  readonly wasm_bindgen__convert__closures_____invoke__h8858c4940749ba4e: (a: number, b: number) => void;
  readonly wasm_bindgen__closure__destroy__h811c98e0171a557f: (a: number, b: number) => void;
  readonly wasm_bindgen__convert__closures_____invoke__ha4fae38b511defde: (a: number, b: number) => void;
  readonly wasm_bindgen__closure__destroy__h079c981bee6ae451: (a: number, b: number) => void;
  readonly wasm_bindgen__convert__closures_____invoke__hbf310d25973d7cca: (a: number, b: number, c: any) => void;
  readonly wasm_bindgen__closure__destroy__hb3f236f34f0e5f6f: (a: number, b: number) => void;
  readonly wasm_bindgen__convert__closures_____invoke__ha603feee3f99e8b9: (a: number, b: number, c: any) => void;
  readonly wasm_bindgen__closure__destroy__hbaa481533da86ef4: (a: number, b: number) => void;
  readonly wasm_bindgen__convert__closures_____invoke__h28d6c2b1cd8e04d5: (a: number, b: number, c: any) => void;
  readonly wasm_bindgen__closure__destroy__h58e802bba8db46e2: (a: number, b: number) => void;
  readonly wasm_bindgen__convert__closures_____invoke__ha2bcddf256a06516: (a: number, b: number) => void;
  readonly wasm_bindgen__closure__destroy__h6660015e720273c6: (a: number, b: number) => void;
  readonly wasm_bindgen__convert__closures_____invoke__h96d0bef365341568: (a: number, b: number, c: any, d: any) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __externref_drop_slice: (a: number, b: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
