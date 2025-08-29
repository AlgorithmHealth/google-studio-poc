import { Injectable, Logger } from '@nestjs/common';
import {
  GoogleGenAI,
  LiveConnectConfig,
  LiveServerMessage,
  MediaResolution,
  Modality,
  Session,
} from '@google/genai';

export interface GeminiLiveCallbacks {
  onMessage: (message: LiveServerMessage) => void;
  onError: (error: ErrorEvent) => void;
  onClose: (event: CloseEvent) => void;
  onOpen: () => void;
}

@Injectable()
export class GeminiAiService {
  private readonly logger = new Logger(GeminiAiService.name);
  private readonly ai: GoogleGenAI;

  constructor() {
    if (!process.env.GOOGLE_API_KEY) {
      throw new Error('GOOGLE_API_KEY environment variable not set.');
    }
    this.ai = new GoogleGenAI({
      apiKey: process.env.GOOGLE_API_KEY,
    });
  }

  async createLiveSession(callbacks: GeminiLiveCallbacks): Promise<Session> {
  const model = 'models/gemini-2.0-flash-live-001'

  const config = {
    responseModalities: [
        Modality.AUDIO,
    ],
    inputModalities: [
      Modality.AUDIO
    ],
    mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
    speechConfig: {
      languageCode: 'en-US',
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: 'Zephyr',
        }
      }
    },
    contextWindowCompression: {
        triggerTokens: '25600',
        slidingWindow: { targetTokens: '12800' },
    },
  };

    this.logger.log('Connecting to Gemini model with config:', JSON.stringify(config, null, 2));

    try {
      const session = await this.ai.live.connect({
        model,
        config,
        callbacks: {
          onopen: () => {
            this.logger.log('Gemini session opened.');
            callbacks.onOpen();
          },
          onmessage: (message: LiveServerMessage) => {
            this.logger.log('Gemini session message received:', JSON.stringify(message));
            callbacks.onMessage(message);
          },
          onerror: (error: ErrorEvent) => {
            this.logger.error('Gemini session error:', error.message);
            callbacks.onError(error);
          },
          onclose: (event: CloseEvent) => {
            this.logger.log('Gemini session closed:', event.reason);
            callbacks.onClose(event);
          },
        },
      });
      this.logger.log('Successfully connected to Gemini Live session.');
      return session;
    } catch (error) {
      this.logger.error('Failed to connect to Gemini Live session', error);
      throw error;
    }
  }
}