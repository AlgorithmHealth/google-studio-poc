import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface AudioChunk {
  data: string;
  mimeType: string;
}

export interface AudioState {
  isRecording: boolean;
  isPlaying: boolean;
  error: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class GeminiAudioService {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  
  // Audio playback queue
  private playQueue: ArrayBuffer[] = [];
  private isPlaying = false;
  
  private readonly SAMPLE_RATE = 24000;
  
  // State management
  private audioStateSubject = new BehaviorSubject<AudioState>({
    isRecording: false,
    isPlaying: false,
    error: null
  });
  
  public audioState$: Observable<AudioState> = this.audioStateSubject.asObservable();

  constructor() {}

  async initializeAudio(): Promise<void> {
    try {
      // Check for browser support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Browser does not support audio recording');
      }

      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: this.SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      this.audioContext = new AudioContext({ sampleRate: this.SAMPLE_RATE });
      this.updateState({ error: null });
      
      console.log('Audio initialized successfully');
    } catch (error) {
      console.error('Error initializing audio:', error);
      const errorMessage = this.getAudioErrorMessage(error);
      this.updateState({ error: errorMessage });
      throw new Error(errorMessage);
    }
  }

  async startRecording(onDataAvailable: (audioChunk: AudioChunk) => void): Promise<void> {
    try {
      if (!this.stream || !this.audioContext) {
        await this.initializeAudio();
      }
      
      // Resume context if it was suspended
      if (this.audioContext!.state === 'suspended') {
        await this.audioContext!.resume();
      }
      
      this.source = this.audioContext!.createMediaStreamSource(this.stream!);
      this.processor = this.audioContext!.createScriptProcessor(4096, 1, 1);
      
      this.source.connect(this.processor);
      this.processor.connect(this.audioContext!.destination);

      // Use the same format as your original code
      const mimeType = `audio/pcm;rate=${this.SAMPLE_RATE}`;

      this.processor.onaudioprocess = (e) => {
        const float32Data = e.inputBuffer.getChannelData(0);
        const pcm16Data = this.float32ToPCM16(float32Data);
        const base64Data = btoa(String.fromCharCode(...pcm16Data));
        
        onDataAvailable({ data: base64Data, mimeType });
      };

      this.updateState({ isRecording: true, error: null });
      console.log('Recording started successfully');
    } catch (error) {
      console.error('Error starting recording:', error);
      const errorMessage = this.getAudioErrorMessage(error);
      this.updateState({ error: errorMessage });
      throw new Error(errorMessage);
    }
  }

  stopRecording(): void {
    try {
      if (this.processor) {
        this.processor.disconnect();
        this.processor = null;
      }
      if (this.source) {
        this.source.disconnect();
        this.source = null;
      }
      this.updateState({ isRecording: false });
      console.log('Recording stopped');
    } catch (error) {
      console.error('Error stopping recording:', error);
      this.updateState({ error: 'Failed to stop recording' });
    }
  }
  
  async playAudioChunk(audioChunk: AudioChunk): Promise<void> {
    try {
      if (!this.audioContext) {
        await this.initializeAudio();
      }

      // Decode base64 PCM data
      const pcmData = this.base64ToPCMBuffer(audioChunk.data);
      const arrayBuffer = pcmData.buffer as any;

      this.playQueue.push(arrayBuffer);
      if (!this.isPlaying) {
        this.playNext();
      }
    } catch (error) {
      console.error('Error queuing audio chunk:', error);
      this.updateState({ error: 'Failed to play audio chunk' });
      throw error;
    }
  }

  private async playNext(): Promise<void> {
    if (this.playQueue.length === 0) {
      this.isPlaying = false;
      this.updateState({ isPlaying: false });
      return;
    }

    this.isPlaying = true;
    this.updateState({ isPlaying: true });
    
    const arrayBuffer = this.playQueue.shift()!;
    
    try {
      if (this.audioContext?.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Create audio buffer from PCM data
      const audioBuffer = this.createAudioBufferFromPCM(arrayBuffer);
      const source = this.audioContext!.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext!.destination);
      
      source.onended = () => {
        // Small delay to prevent audio gaps
        setTimeout(() => this.playNext(), 10);
      };
      
      source.start();
    } catch (error) {
      console.error('Error playing audio chunk:', error);
      this.updateState({ error: 'Failed to play audio' });
      // Continue with the next chunk even if one fails
      setTimeout(() => this.playNext(), 100);
    }
  }

  private base64ToPCMBuffer(base64Data: string): Int16Array {
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Convert bytes to Int16Array (PCM 16-bit)
    return new Int16Array(bytes.buffer);
  }

  private createAudioBufferFromPCM(arrayBuffer: ArrayBuffer): AudioBuffer {
    const pcmData = new Int16Array(arrayBuffer);
    const audioBuffer = this.audioContext!.createBuffer(1, pcmData.length, this.SAMPLE_RATE);
    const channelData = audioBuffer.getChannelData(0);
    
    // Convert Int16 PCM to Float32 for Web Audio API
    for (let i = 0; i < pcmData.length; i++) {
      channelData[i] = pcmData[i] / 0x8000; // Convert to -1.0 to 1.0 range
    }
    
    return audioBuffer;
  }

  private float32ToPCM16(float32Array: Float32Array): Uint8Array {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return new Uint8Array(pcm16.buffer);
  }

  private updateState(partialState: Partial<AudioState>): void {
    const currentState = this.audioStateSubject.value;
    this.audioStateSubject.next({ ...currentState, ...partialState });
  }

  private getAudioErrorMessage(error: any): string {
    if (error.name === 'NotAllowedError') {
      return 'Microphone access denied. Please allow microphone permissions.';
    } else if (error.name === 'NotFoundError') {
      return 'No microphone found. Please connect a microphone.';
    } else if (error.name === 'NotSupportedError') {
      return 'Audio recording not supported in this browser.';
    } else if (error.name === 'OverconstrainedError') {
      return 'Audio constraints cannot be satisfied by available devices.';
    } else {
      return error.message || 'Unknown audio error occurred';
    }
  }

  cleanup(): void {
    this.stopRecording();
    
    // Stop all media tracks
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    // Close audio context
    if (this.audioContext) {
      this.audioContext.close().catch(console.error);
      this.audioContext = null;
    }
    
    // Clear playback queue
    this.playQueue = [];
    this.isPlaying = false;
    
    // Reset state
    this.updateState({ 
      isRecording: false, 
      isPlaying: false, 
      error: null 
    });
    
    console.log('Audio service cleaned up');
  }

  // Utility methods
  getCurrentState(): AudioState {
    return this.audioStateSubject.value;
  }

  getQueueLength(): number {
    return this.playQueue.length;
  }

  clearQueue(): void {
    this.playQueue = [];
    if (!this.isPlaying) {
      this.updateState({ isPlaying: false });
    }
  }
}