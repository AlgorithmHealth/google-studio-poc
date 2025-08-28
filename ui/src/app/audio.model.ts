/**
 * Represents the state of the audio service.
 */
export interface AudioState {
  isRecording: boolean;
  isPlaying: boolean;
  error: string | null;
}

/**
 * Represents a chunk of audio data, typically for transport to an API.
 */
export interface AudioChunk {
  data: string; // Base64 encoded audio data
  mimeType: string;
}

/**
 * Represents a message in the conversation history.
 */
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

/**
 * Represents a message received from the realtime service.
 */
export interface AppMessage {
    type: 'text' | 'audio' | 'turn-complete' | 'error';
    payload?: any;
}