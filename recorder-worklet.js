// Streams raw PCM to the main thread while recording. The engine connects the
// band master + mic into this node's single input (Web Audio sums them), and
// toggles capture via 'start'/'stop' port messages.
class RecorderWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.port.onmessage = (e) => {
      if (e.data === 'start') this.recording = true;
      else if (e.data === 'stop') this.recording = false;
    };
  }

  process(inputs) {
    if (!this.recording) return true;
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0]) return true;
    const left  = input[0];
    const right = input[1] || input[0];
    // copy — the audio thread reuses these buffers each block
    this.port.postMessage({ left: new Float32Array(left), right: new Float32Array(right) });
    return true;
  }
}

registerProcessor('recorder-worklet', RecorderWorklet);
