import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    MessageBody,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { Session, LiveServerMessage } from '@google/genai';
import { GeminiAiService } from './gemini-ai.service';

@WebSocketGateway({
    cors: {
        origin: '*', // Be more specific in production
        credentials: true,
    },
})
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(AppGateway.name);
    private connections = new Map<string, Session>();

    constructor(private readonly geminiAiService: GeminiAiService) { }

    handleConnection(client: Socket) {
        this.logger.log(`Client connected: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);
        const geminiSession = this.connections.get(client.id);
        if (geminiSession) {
            geminiSession.close();
            this.connections.delete(client.id);
            this.logger.log(`Gemini session closed and removed for client: ${client.id}`);
        }
    }

    @SubscribeMessage('start-session')
    async startSession(@ConnectedSocket() client: Socket) {
        if (this.connections.has(client.id)) {
            this.logger.warn(`Client ${client.id} already has an active session.`);
            client.emit('session-error', { message: 'Session already active.' });
            return;
        }

        this.logger.log(`Starting Gemini session for client: ${client.id}`);
        try {
            const geminiSession = await this.geminiAiService.createLiveSession({
                onOpen: () => {
                    this.logger.log(`Gemini session opened for client: ${client.id}`);
                    client.emit('session-started');
                },
                onMessage: async (message: LiveServerMessage) => {
                    if (message) {
                        this.handleGeminiMessage(client, message);
                    } else {
                        await new Promise((resolve) => setTimeout(resolve, 100));
                    }
                },
                onError: (error: ErrorEvent) => {
                    this.logger.error(`Gemini session error for client ${client.id}:`, error.message);
                    client.emit('session-error', { message: error.message });
                    this.connections.delete(client.id);
                },
                onClose: (event: CloseEvent) => {
                    this.logger.log(`Gemini session closed for client ${client.id}: ${event.reason}`);
                    client.emit('session-closed', { reason: event.reason });
                    this.connections.delete(client.id);
                },
            });

            this.connections.set(client.id, geminiSession);
        } catch (error) {
            this.logger.error(`Failed to start Gemini session for client ${client.id}:`, error);
            client.emit('session-error', {
                message: 'Failed to initiate Gemini session.',
            });
        }
    }

    @SubscribeMessage('send-text')
    handleTextMessage(
        @ConnectedSocket() client: Socket,
        @MessageBody() text: string,
    ) {
        const geminiSession = this.connections.get(client.id);
        if (geminiSession) {
            this.logger.log(`Sending text from client ${client.id}: "${text}"`);
            geminiSession.sendClientContent({ turns: [text] });
        } else {
            this.logger.warn(`Client ${client.id} tried to send text without a session.`);
            client.emit('session-error', { message: 'No active session.' });
        }
    }

    @SubscribeMessage('send-audio-chunk')
    handleAudioChunk(
        @ConnectedSocket() client: Socket,
        @MessageBody() audioData: { data: string; mimeType: string },
    ) {
        const geminiSession = this.connections.get(client.id);
        if (geminiSession) {
            geminiSession.sendClientContent({
                turns: 
                    {
                        inlineData: audioData,
                    }
            });
        } else {
            this.logger.warn(`Client ${client.id} tried to send audio without a session.`);
            client.emit('session-error', { message: 'No active session.' });
        }
    }

    // ✅ CORRECTED FUNCTION
    private handleGeminiMessage(client: Socket, message: LiveServerMessage) {
        if (message.serverContent?.modelTurn?.parts) {
            const part = message.serverContent?.modelTurn?.parts?.[0];

            if (part?.inlineData) {
                client.emit('audio-part', {
                    audio: {
                        data: part.inlineData.data, // This is a base64 string
                        mimeType: part.inlineData.mimeType,
                    },
                });
            }

            if (part?.text) {
                client.emit('text-part', { text: part.text });
                console.log(part?.text);
            } 
        }
    }

    @SubscribeMessage('end-session')
    handleEndSession(@ConnectedSocket() client: Socket) {
        this.logger.log(`Client ${client.id} requested to end the session.`);
        this.handleDisconnect(client);
    }
}
