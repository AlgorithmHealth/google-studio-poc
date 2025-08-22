import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppGateway } from './app.gateway';
import { GeminiAiService } from './gemini-ai.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot({
  isGlobal: true,
})],
  controllers: [AppController],
  providers: [AppService, AppGateway, GeminiAiService],
})
export class AppModule {}
