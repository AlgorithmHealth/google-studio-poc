/**
 * Converts a Float32Array (from Web Audio API) to a 16-bit PCM Uint8Array.
 * @param float32Array The input array with samples ranging from -1.0 to 1.0.
 * @returns A Uint8Array containing the 16-bit PCM data.
 */
export function float32ToPcm16(float32Array: Float32Array): Uint8Array {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    // Clamp the sample to the [-1, 1] range
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    // Convert to 16-bit signed integer
    // 0x8000 is -32768, 0x7FFF is 32767
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return new Uint8Array(pcm16.buffer);
}

/**
 * Converts a 16-bit PCM Int16Array to a Float32Array for playback.
 * @param pcm16Array The input array with 16-bit signed integer samples.
 * @returns A Float32Array with samples ranging from -1.0 to 1.0.
 */
export function pcm16ToFloat32(pcm16Array: Int16Array): Float32Array {
  const float32Array = new Float32Array(pcm16Array.length);
  for (let i = 0; i < pcm16Array.length; i++) {
    // Convert back to the -1.0 to 1.0 range
    float32Array[i] = pcm16Array[i] / 0x8000;
  }
  return float32Array;
}