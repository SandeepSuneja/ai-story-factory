import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { extname } from 'path';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  AddKnowledgeDocumentsRequestDto,
  AskKnowledgeRequestDto,
  AskKnowledgeResponseDto,
  CreateKnowledgeSourceRequestDto,
  KnowledgeSourceRecord,
  KnowledgeSourceSummary,
  SearchKnowledgeRequestDto,
  SearchKnowledgeResponseDto,
} from './models/knowledge.model';
import { QaAgent } from './agents/qa.agent';
import { KnowledgeService } from './services/knowledge.service';
import { RagService } from './services/rag.service';
import { RetrievalService } from './services/retrieval.service';

interface UploadedKnowledgeFile {
  buffer: Buffer;
  originalname: string;
}

const KNOWLEDGE_UPLOAD_EXTENSIONS = new Set(['.txt', '.md']);

function assertKnowledgeUploadFilename(filename: string): void {
  const extension = extname(filename).toLowerCase();
  if (!KNOWLEDGE_UPLOAD_EXTENSIONS.has(extension)) {
    throw new BadRequestException('Only .txt and .md UTF-8 files are supported.');
  }
}

@Controller('knowledge')
export class KnowledgeController {
  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly retrievalService: RetrievalService,
    private readonly ragService: RagService,
    private readonly qaAgent: QaAgent,
  ) {}

  @Get('health')
  async health() {
    const ragHealthy = await this.ragService.isHealthy();
    return {
      status: ragHealthy ? 'ok' : 'degraded',
      rag: ragHealthy,
    };
  }

  @Get()
  listSources(): Promise<KnowledgeSourceSummary[]> {
    return this.knowledgeService.listSources();
  }

  @Post()
  createSource(
    @Body() body: CreateKnowledgeSourceRequestDto,
  ): Promise<KnowledgeSourceRecord> {
    return this.knowledgeService.createSource(body);
  }

  @Get(':id')
  getSource(@Param('id') id: string): Promise<KnowledgeSourceRecord> {
    return this.knowledgeService.getSource(id);
  }

  @Delete(':id')
  @HttpCode(204)
  deleteSource(@Param('id') id: string): Promise<void> {
    return this.knowledgeService.deleteSource(id);
  }

  @Post(':id/documents')
  addDocuments(
    @Param('id') id: string,
    @Body() body: AddKnowledgeDocumentsRequestDto,
  ): Promise<KnowledgeSourceRecord> {
    return this.knowledgeService.addDocuments(id, body);
  }

  @Post(':id/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: UploadedKnowledgeFile,
    @Body('title') title?: string,
  ): Promise<KnowledgeSourceRecord> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('file is required');
    }
    const filename = file.originalname || 'upload.txt';
    assertKnowledgeUploadFilename(filename);
    return this.knowledgeService.uploadDocument(
      id,
      filename,
      file.buffer,
      title,
    );
  }

  @Post(':id/search')
  async searchSource(
    @Param('id') id: string,
    @Body() body: SearchKnowledgeRequestDto,
  ): Promise<SearchKnowledgeResponseDto> {
    const query = body.query?.trim();
    if (!query) {
      throw new BadRequestException('query is required');
    }

    const result = await this.retrievalService.searchSource(
      id,
      query,
      body.topK ?? 6,
    );
    return result;
  }

  @Post(':id/ask')
  async askSource(
    @Param('id') id: string,
    @Body() body: AskKnowledgeRequestDto,
  ): Promise<AskKnowledgeResponseDto> {
    const question = body.question?.trim();
    if (!question) {
      throw new BadRequestException('question is required');
    }

    const result = await this.retrievalService.searchSource(
      id,
      question,
      body.topK ?? 6,
    );
    const answer = await this.qaAgent.answer(
      question,
      result.sourceName,
      result.hits,
    );

    return {
      answer,
      sourceId: result.sourceId,
      sourceName: result.sourceName,
      question,
      hits: result.hits,
    };
  }
}
