function float32ToPcm16(float32Array: Float32Array): Int16Array {
  // ... (implementation is correct)
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return pcm16;
}

class PcmRecorderProcessor extends AudioWorkletProcessor {
  private bufferSize = 4096;
  private _buffer: Int16Array = new Int16Array(this.bufferSize);
  private _bytesWritten = 0;

  constructor() {
    super();
  }

  process(inputs: Float32Array[][]): boolean {
    const inputChannel = inputs[0]?.[0];

    if (!inputChannel) {
      return true;
    }

    const pcm16Data = float32ToPcm16(inputChannel);

    for (let i = 0; i < pcm16Data.length; i++) {
        this._buffer[this._bytesWritten++] = pcm16Data[i];
    }
    
    if (this._bytesWritten >= this.bufferSize) {
      // This is a more performant way to send the data.
      // The second argument transfers ownership of the buffer's memory
      // instead of copying it.
      this.port.postMessage(this._buffer, [this._buffer.buffer]);
      
      this._buffer = new Int16Array(this.bufferSize);
      this._bytesWritten = 0;
    }

    return true;
  }
}

registerProcessor('pcm-recorder-processor', PcmRecorderProcessor);