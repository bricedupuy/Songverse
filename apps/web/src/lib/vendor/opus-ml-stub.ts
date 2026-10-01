/**
 * Stands in for @wasm-audio-decoders/opus-ml (8 MB), which ogg-opus-decoder
 * imports only for its speech enhancement - never used here (issue #185) -
 * so it stays out of the build.
 */
export class OpusMLDecoder {
  constructor() {
    throw new Error("Opus speech enhancement isn't included");
  }
}
export const OpusMLDecoderWebWorker = OpusMLDecoder;
