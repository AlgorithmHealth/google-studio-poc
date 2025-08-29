
class PCMRecorderProcessor extends AudioWorkletProcessor {
  // Use static getter to define parameters if needed, though not required for this simple case.
  
  constructor() {
    super();
    this.bufferSize = 4096; // The size of chunks we want to send
    this.buffer = new Float32Array(0); // Use a Float32Array for the buffer for efficiency
    
    // The target sample rate for the output
    this.targetSampleRate = 16000;
    
    // The actual sample rate of the AudioContext is available as a global
    // in the AudioWorkletGlobalScope.
    this.inputSampleRate = sampleRate;
    
    console.log(`AudioWorklet started with input sample rate: ${this.inputSampleRate}`);
  }

  /**
   * Appends new data to the internal buffer.
   */
  append(data) {
    const newBuffer = new Float32Array(this.buffer.length + data.length);
    newBuffer.set(this.buffer);
    newBuffer.set(data, this.buffer.length);
    this.buffer = newBuffer;
  }

  /**
   * Convert Float32Array to Int16Array (PCM16 format)
   */
  float32ToPCM16(float32Array) {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }
    return pcm16;
  }

  /**
   * Simple downsampling using linear interpolation.
   */
  downsample(buffer) {
    if (this.inputSampleRate === this.targetSampleRate) {
      return buffer;
    }
    
    const sampleRateRatio = this.inputSampleRate / this.targetSampleRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);
    
    for (let i = 0; i < newLength; i++) {
        // A simple but effective way: take the sample at the corresponding position
        const index = i * sampleRateRatio;
        result[i] = buffer[Math.floor(index)];
    }
    
    return result;
  }

  process(inputs, outputs, parameters) {
    // We only care about the first input, and the first channel (mono) of that input.
    const inputChannel = inputs[0][0];

    // If there's no data, we have nothing to do.
    if (!inputChannel) {
      return true; // Keep the processor alive.
    }

    // Append the new audio data to our internal buffer.
    this.append(inputChannel);

    // Process the buffer in chunks of `bufferSize`. A while loop is more robust
    // than an if statement in case a large chunk of data comes in.
    while (this.buffer.length >= this.bufferSize) {
      const chunkToProcess = this.buffer.subarray(0, this.bufferSize);
      
      // Remove the processed chunk from the start of our buffer.
      this.buffer = this.buffer.subarray(this.bufferSize);

      // Downsample the chunk to our target sample rate (e.g., 16000 Hz)
      const downsampledBuffer = this.downsample(chunkToProcess);
      
      // Convert the downsampled audio from 32-bit float to 16-bit signed integer PCM.
      const pcm16Buffer = this.float32ToPCM16(downsampledBuffer);
      
      // Post the PCM data back to the main thread.
      // The second argument is a list of "Transferable" objects. This transfers
      // ownership of the buffer's memory to the main thread, which is much
      // more efficient than copying it (zero-copy transfer).
      this.port.postMessage(pcm16Buffer, [pcm16Buffer.buffer]);
    }
    
    // Return true to indicate the processor should not be terminated.
    return true;
  }
}

registerProcessor('pcm-recorder-processor', PCMRecorderProcessor);