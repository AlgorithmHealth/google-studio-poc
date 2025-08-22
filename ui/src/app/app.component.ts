import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppMessage, GeminiRealtimeAudioService } from './gemini-realtime-audio.service';
import { GeminiAudioService } from './gemini-audio.service';

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  connectionStatus = 'disconnected';
  isRecording = false;
  isPlaying = false;
  conversationHistory: ConversationMessage[] = [];
  audioError: string | null = null;

  summary = signal<{ extracted_data: string }>({ extracted_data: '' });
  private subscriptions: Subscription[] = [];

  constructor(
    private realtimeService: GeminiRealtimeAudioService,
    private audioService: GeminiAudioService,
  ) { }

  ngOnInit(): void {
    this.initializeAudioService();
    this.setupServiceSubscriptions();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.audioService.cleanup();
    this.realtimeService.disconnect();
  }

  private async initializeAudioService(): Promise<void> {
    try {
      await this.audioService.initializeAudio();
      console.log('Audio service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize audio service:', error);
      this.audioError = 'Failed to initialize audio. Please check microphone permissions.';
    }
  }

  private setupServiceSubscriptions(): void {
    // Subscribe to connection status
    this.subscriptions.push(
      this.realtimeService.getConnectionStatus().subscribe(status => {
        this.connectionStatus = status;
        if (status === 'error') {
          this.isRecording = false;
        }
      })
    );

    // Subscribe to messages from the realtime service
    this.subscriptions.push(
      this.realtimeService.getMessages().subscribe(message => {
        if (message) {
          this.handleAppMessage(message);
        }
      })
    );

    // Subscribe to audio service state for playback status
    this.subscriptions.push(
      this.audioService.audioState$.subscribe(audioState => {
        this.isPlaying = audioState.isPlaying;
        if (audioState.error) {
          this.audioError = audioState.error;
        }
      })
    );
  }

  // --- UI ACTIONS ---

  startSession(): void {
    if (this.connectionStatus === 'connected') {
      this.realtimeService.startSession();
      this.conversationHistory = [];
      this.audioError = null;
    }
  }

  async startRecording(): Promise<void> {
    if (this.connectionStatus !== 'session-active') {
      this.addMessage('system', 'Session not active. Please start a session first.', new Date());
      return;
    }

    try {
      this.isRecording = true;
      this.audioError = null;
      this.addMessage('user', '...(Listening)', new Date());
      
      await this.audioService.startRecording((audioChunk) => {
        // Send audio chunks to the server as they become available
        this.realtimeService.sendAudioChunk(audioChunk);
      });
    } catch (error) {
      console.error('Failed to start recording:', error);
      this.addMessage('system', `Error starting recording: ${error}`, new Date());
      this.isRecording = false;
      this.audioError = 'Failed to start recording. Please check microphone permissions.';
    }
  }

  stopRecording(): void {
    this.audioService.stopRecording();
    this.isRecording = false;
    
    // Find the '...(Listening)' message and update it
    const listeningMessage = this.conversationHistory.find(m => m.content === '...(Listening)');
    if (listeningMessage) {
      listeningMessage.content = '...(Processing)';
    }
  }

  endSession(): void {
    // Stop any ongoing recording
    if (this.isRecording) {
      this.stopRecording();
    }
    
    this.realtimeService.endSession();
    // this.dialogRef.close(this.summary());
    console.log(`Session ended, Summary`);
  }
  
  closeChat(): void {
    window.location.reload();
    // Stop any ongoing recording
    // if (this.isRecording) {
    //   this.stopRecording();
    // }
    
    // // this.dialogRef.close(this.summary());
    // console.log(`Chat closed, Summary: ${this.summary()}`);
  }

  // Test method for development
  testTextMessage(): void {
    const input = 'hi there'
    if (this.connectionStatus === 'session-active') {
      this.realtimeService.sendTextPart(input);
    }
  }

  // --- MESSAGE HANDLING ---

  private handleAppMessage(message: AppMessage): void {
    switch (message.type) {
      case 'text':
        this.handleAssistantText(message.payload);
        this.checkForSummary(message.payload);
        break;

      case 'audio':
        this.handleAudioPlayback(message.payload);
        break;
      
      case 'turn-complete':
        this.handleTurnComplete();
        break;
        
      case 'error':
        this.addMessage('system', `Error: ${message.payload?.message || 'Unknown error'}`, new Date());
        break;
    }
  }
  
  private handleAssistantText(text: string): void {
    const lastMessage = this.conversationHistory[this.conversationHistory.length - 1];
    
    // If the last message was from the user (or system), create a new assistant message
    if (!lastMessage || lastMessage.role !== 'assistant') {
      this.addMessage('assistant', text, new Date());
    } else {
      // Otherwise, append to the existing assistant message to create a streaming effect
      lastMessage.content += text;
    }
  }

  private async handleAudioPlayback(audioPayload: { data: string; mimeType: string }): Promise<void> {
    try {
      await this.audioService.playAudioChunk(audioPayload);
      console.log('Playing audio chunk');
    } catch (error) {
      console.error('Failed to play audio chunk:', error);
      this.audioError = 'Failed to play audio response';
    }
  }

  private handleTurnComplete(): void {
    // The assistant has finished its current response
    const lastMsg = this.conversationHistory[this.conversationHistory.length - 1];
    if (lastMsg?.role === 'assistant') {
      // You can add any finalization logic here if needed
      console.log('Assistant turn completed');
    }
    
    // Clear any processing messages
    this.conversationHistory = this.conversationHistory.filter(m => 
      !m.content.startsWith('...(Processing)')
    );
  }

  private addMessage(role: ConversationMessage['role'], content: string, timestamp: Date): void {
    // Don't clean up temporary messages if we're appending to assistant message
    if (role !== 'assistant' || this.conversationHistory.length === 0 || 
        this.conversationHistory[this.conversationHistory.length - 1].role !== 'assistant') {
      // Clean up any temporary messages first
      this.conversationHistory = this.conversationHistory.filter(m => 
        !m.content.startsWith('...(') || m.content.startsWith('...(Processing)')
      );
    }
    
    this.conversationHistory.push({ role, content, timestamp });
  }

  private checkForSummary(text: string): void {
    const upperText = text.toUpperCase();
    if (upperText.includes('CLINICAL SUMMARY')) {
      // Since text arrives in chunks, we need to re-evaluate the whole conversation
      const fullAssistantResponse = this.conversationHistory
        .filter(m => m.role === 'assistant')
        .map(m => m.content)
        .join(' ');
        
      const match = fullAssistantResponse.match(/## CLINICAL SUMMARY[\s\S]*/i);
      if (match) {
        this.summary.set({ extracted_data: match[0].trim() });
      }
    }
  }

  // --- UTILITY METHODS ---

  clearAudioError(): void {
    this.audioError = null;
  }

  getStatusClass(): string {
    return `status-${this.connectionStatus}`;
  }

  getRecordingButtonText(): string {
    if (this.isRecording) {
      return 'Recording...';
    }
    return this.audioError ? 'Check Audio Permissions' : 'Start Recording';
  }
}