import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';

// A standardized interface for messages from our service to the component
export interface AppMessage {
  type: 'text' | 'audio' | 'turn-complete' | 'error';
  payload: any;
}

const environment = {
  API_URL: 'http://localhost:3000/'
}

@Injectable({
  providedIn: 'root'
})
export class GeminiRealtimeAudioService {
  private socket: Socket;
  private connectionStatus = new BehaviorSubject<string>('disconnected');
  private messages = new BehaviorSubject<AppMessage | null>(null);

  

  constructor() {
    // Ensure the URL is correct for socket.io (remove trailing slash if present)
    const url = environment.API_URL.endsWith('/') ? environment.API_URL.slice(0, -1) : environment.API_URL;
    this.socket = io(url, {
      transports: ['websocket']
    });

    this.setupSocketListeners();
  }

  private setupSocketListeners(): void {
    this.socket.on('connect', () => {
      console.log('Connected to NestJS server');
      this.connectionStatus.next('connected');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from NestJS server');
      this.connectionStatus.next('disconnected');
    });

    // Event from backend when Gemini session is ready
    this.socket.on('session-started', () => {
      console.log('Realtime session started');
      this.connectionStatus.next('session-active');
    });

    this.socket.on('session-error', (error) => {
      console.error('Session error:', error);
      this.connectionStatus.next('error');
      this.messages.next({ type: 'error', payload: error });
    });

    // Event from backend when Gemini session is explicitly closed
    this.socket.on('session-closed', (data) => {
      console.log('Session closed:', data.reason);
      this.connectionStatus.next('connected'); // Or 'disconnected' depending on desired state
    });

    // --- NEW GEMINI-SPECIFIC EVENT LISTENERS ---

    this.socket.on('text-part', (data: { text: string }) => {
      this.messages.next({ type: 'text', payload: data.text });
    });

    this.socket.on('audio-part', (data: { audio: { data: string; mimeType: string; } }) => {
      this.messages.next({ type: 'audio', payload: data.audio });
    });

    this.socket.on('turn-complete', () => {
      this.messages.next({ type: 'turn-complete', payload: null });
    });
  }

  // --- UPDATED PUBLIC METHODS ---

  startSession(): void {
    this.socket.emit('start-session');
  }

  // Changed from sendAudio to be more descriptive
  sendAudioChunk(audioData: { data: string, mimeType: string }): void {
    if (this.socket.connected) {
      this.socket.emit('send-audio-chunk', audioData);
    }
  }

  sendTextPart(text: string){
    this.socket.emit('send-text', text);
  }

  endSession(): void {
    if (this.socket.connected) {
      this.socket.emit('end-session');
    }
  }

  // No longer needed: commitAudio(), createResponse()

  getConnectionStatus(): Observable<string> {
    return this.connectionStatus.asObservable();
  }

  getMessages(): Observable<AppMessage | null> {
    return this.messages.asObservable();
  }

  disconnect(): void {
    this.endSession();
    this.socket.disconnect();
  }
}