import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { pcm16ToFloat32 } from './audio-pcm.utils';
import { AudioChunk, AudioState } from './audio.model';

@Injectable({
  providedIn: 'root'
})
export class GeminiAudioService {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;

  // Audio playback queue
  private playQueue: ArrayBuffer[] = [];
  private isPlayingFromQueue = false;

  private readonly SAMPLE_RATE = 16000;
  private readonly WORKLET_URL = 'assets/js/pcm-recorder.worklet.js';

  private audioStateSubject = new BehaviorSubject<AudioState>({
    isRecording: false,
    isPlaying: false,
    error: null
  });
  public audioState$: Observable<AudioState> = this.audioStateSubject.asObservable();

  async initializeAudio(): Promise<void> {
    try {
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
      // The AudioWorklet must be loaded before it can be used.
      await this.audioContext.audioWorklet.addModule(this.WORKLET_URL);
      
      this.updateState({ error: null });
      console.log('Audio service initialized successfully');
    } catch (error) {
      console.error('Error initializing audio:', error);
      const errorMessage = this.getAudioErrorMessage(error);
      this.updateState({ error: errorMessage });
      throw new Error(errorMessage);
    }
  }

  async startRecording(onDataAvailable: (audioChunk: AudioChunk) => void): Promise<void> {
    if (!this.stream || !this.audioContext) {
      await this.initializeAudio();
    }
    
    // This check is crucial for handling user interaction requirements
    if (this.audioContext!.state === 'suspended') {
      await this.audioContext!.resume();
    }

    this.source = this.audioContext!.createMediaStreamSource(this.stream!);
    this.workletNode = new AudioWorkletNode(this.audioContext!, 'pcm-recorder-processor');
    
    this.workletNode.port.onmessage = (event: MessageEvent<Int16Array>) => {
      // The event.data is the Int16Array from the worklet.
      // We need to convert its buffer to Base64.
      const pcm16Data = new Uint8Array(event.data.buffer);
      const base64Data = btoa(String.fromCharCode(...pcm16Data));
      
      onDataAvailable({
        data: base64Data,
        mimeType: `audio/pcm;rate=${this.SAMPLE_RATE}`
      });
    };

    this.source.connect(this.workletNode);
    // Note: We don't connect the workletNode to the destination,
    // to avoid hearing the raw microphone input (feedback).

    this.updateState({ isRecording: true, error: null });
    console.log('Recording started successfully');
  }

  stopRecording(): void {
    if (this.workletNode) {
      this.workletNode.port.onmessage = null; // Clean up listener
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    this.updateState({ isRecording: false });
    console.log('Recording stopped');
  }

  async playAudioChunk(audioChunk: AudioChunk): Promise<void> {
    if (!this.audioContext) {
      throw new Error('Audio context not initialized for playback.');
    }
    const pcmData = this.base64ToPCMBuffer(audioChunk.data);
    this.playQueue.push(pcmData.buffer as any);
    if (!this.isPlayingFromQueue) {
      this.playNextInQueue();
    }
  }

  private async playNextInQueue(): Promise<void> {
    if (this.playQueue.length === 0) {
      this.isPlayingFromQueue = false;
      this.updateState({ isPlaying: false });
      return;
    }

    this.isPlayingFromQueue = true;
    this.updateState({ isPlaying: true });

    const arrayBuffer = this.playQueue.shift()!;

    try {
      if (this.audioContext!.state === 'suspended') {
        await this.audioContext!.resume();
      }

      const audioBuffer = this.createAudioBufferFromPCM(arrayBuffer, 24000);
      const source = this.audioContext!.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext!.destination);
      source.onended = () => this.playNextInQueue();
      source.start();
    } catch (error) {
      console.error('Error playing audio chunk:', error);
      this.updateState({ error: 'Failed to play audio' });
      // Continue with the next chunk even if one fails
      this.playNextInQueue();
    }
  }

  private createAudioBufferFromPCM(arrayBuffer: ArrayBuffer, sampleRate: number): AudioBuffer {
    const pcm16Data = new Int16Array(arrayBuffer);
    const float32Data = pcm16ToFloat32(pcm16Data) as any;
    const audioBuffer = this.audioContext!.createBuffer(1, float32Data.length, sampleRate);
    audioBuffer.copyToChannel(float32Data, 0);
    return audioBuffer;
  }

  private base64ToPCMBuffer(base64Data: string): Int16Array {
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Int16Array(bytes.buffer);
  }

  private updateState(partialState: Partial<AudioState>): void {
    this.audioStateSubject.next({ ...this.audioStateSubject.value, ...partialState });
  }

  private getAudioErrorMessage(error: any): string {
    // ... (This function is good, no changes needed)
    if (error.name === 'NotAllowedError') return 'Microphone access denied. Please allow microphone permissions.';
    if (error.name === 'NotFoundError') return 'No microphone found. Please connect a microphone.';
    if (error.name === 'NotSupportedError') return 'Audio recording not supported in this browser.';
    if (error.name === 'OverconstrainedError') return 'Audio constraints cannot be satisfied by available devices.';
    return error.message || 'Unknown audio error occurred';
  }

  cleanup(): void {
    this.stopRecording();
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(console.error);
      this.audioContext = null;
    }
    this.playQueue = [];
    this.isPlayingFromQueue = false;
    this.updateState({ isRecording: false, isPlaying: false, error: null });
    console.log('Audio service cleaned up');
  }
}