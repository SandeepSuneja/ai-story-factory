import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import type {
  AddKnowledgeDocumentsRequestDto,
  CreateKnowledgeSourceRequestDto,
  KnowledgeSourceRecord,
  KnowledgeSourceSummary,
} from '../models/knowledge.model';
import { RagService } from './rag.service';

@Injectable()
export class KnowledgeService implements OnModuleInit {
  private readonly storageDir =
    process.env.KNOWLEDGE_STORAGE_DIR ??
    join(process.cwd(), 'storage', 'knowledge');

  constructor(private readonly ragService: RagService) {}

  async onModuleInit() {
    await mkdir(this.storageDir, { recursive: true });
  }

  private sourcePath(id: string) {
    return join(this.storageDir, `${id}.json`);
  }

  private normalize(record: KnowledgeSourceRecord): KnowledgeSourceRecord {
    return {
      ...record,
      name: record.name.trim(),
      description: record.description?.trim() ?? '',
      documentCount: record.documentCount ?? 0,
      chunkCount: record.chunkCount ?? 0,
    };
  }

  private async readSource(id: string): Promise<KnowledgeSourceRecord> {
    try {
      const raw = await readFile(this.sourcePath(id), 'utf8');
      return this.normalize(JSON.parse(raw) as KnowledgeSourceRecord);
    } catch {
      throw new NotFoundException(`Knowledge source ${id} not found`);
    }
  }

  private async writeSource(record: KnowledgeSourceRecord): Promise<void> {
    await writeFile(
      this.sourcePath(record.id),
      JSON.stringify(this.normalize(record), null, 2),
      'utf8',
    );
  }

  private toSummary(record: KnowledgeSourceRecord): KnowledgeSourceSummary {
    return {
      id: record.id,
      name: record.name,
      description: record.description,
      documentCount: record.documentCount,
      chunkCount: record.chunkCount,
      updatedAt: record.updatedAt,
    };
  }

  async listSources(): Promise<KnowledgeSourceSummary[]> {
    const entries = await readdir(this.storageDir, { withFileTypes: true });
    const records = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map(async (entry) => {
          const raw = await readFile(
            join(this.storageDir, entry.name),
            'utf8',
          );
          return this.normalize(JSON.parse(raw) as KnowledgeSourceRecord);
        }),
    );

    return records
      .map((record) => this.toSummary(record))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getSource(id: string): Promise<KnowledgeSourceRecord> {
    return this.readSource(id);
  }

  async createSource(
    body: CreateKnowledgeSourceRequestDto,
  ): Promise<KnowledgeSourceRecord> {
    const name = body.name?.trim();
    if (!name) {
      throw new BadRequestException('name is required');
    }

    const collection = await this.ragService.createCollection(
      name,
      body.description?.trim() ?? '',
    );
    const now = new Date().toISOString();
    const record: KnowledgeSourceRecord = {
      id: collection.id,
      name: collection.name,
      description: collection.description,
      collectionId: collection.id,
      documentCount: collection.document_count,
      chunkCount: collection.chunk_count,
      createdAt: now,
      updatedAt: now,
    };

    await this.writeSource(record);
    return record;
  }

  async addDocuments(
    id: string,
    body: AddKnowledgeDocumentsRequestDto,
  ): Promise<KnowledgeSourceRecord> {
    const source = await this.readSource(id);
    const documents = body.documents
      .map((document) => ({
        id: document.id ?? randomUUID(),
        title: document.title?.trim(),
        text: document.text?.trim() ?? '',
        metadata: document.metadata,
      }))
      .filter((document) => document.text.length > 0);

    if (documents.length === 0) {
      throw new BadRequestException('At least one non-empty document is required');
    }

    const collection = await this.ragService.indexDocuments(
      source.collectionId,
      documents,
    );

    const updated: KnowledgeSourceRecord = {
      ...source,
      documentCount: collection.document_count,
      chunkCount: collection.chunk_count,
      updatedAt: new Date().toISOString(),
    };
    await this.writeSource(updated);
    return updated;
  }

  async uploadDocument(
    id: string,
    filename: string,
    content: Buffer,
    title?: string,
  ): Promise<KnowledgeSourceRecord> {
    const source = await this.readSource(id);
    const collection = await this.ragService.uploadDocument(
      source.collectionId,
      filename,
      content,
      title,
    );

    const updated: KnowledgeSourceRecord = {
      ...source,
      documentCount: collection.document_count,
      chunkCount: collection.chunk_count,
      updatedAt: new Date().toISOString(),
    };
    await this.writeSource(updated);
    return updated;
  }

  async deleteSource(id: string): Promise<void> {
    const source = await this.readSource(id);
    await this.ragService.deleteCollection(source.collectionId);
    await unlink(this.sourcePath(id));
  }
}
