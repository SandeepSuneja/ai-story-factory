import {
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import type { StoryCharacter } from '../content-state';
import { mergeCharacterLibraries } from '../characters';
import {
  CreateSeriesRequestDto,
  mergeVisualStyle,
  type SeriesRecord,
  type SeriesSummary,
  UpdateSeriesRequestDto,
} from '../models/series.model';

@Injectable()
export class SeriesService implements OnModuleInit {
  private readonly storageDir =
    process.env.SERIES_STORAGE_DIR ??
    join(process.cwd(), 'storage', 'series');

  private readonly projectStorageDir =
    process.env.PROJECT_STORAGE_DIR ??
    join(process.cwd(), 'storage', 'projects');

  async onModuleInit() {
    await mkdir(this.storageDir, { recursive: true });
  }

  private seriesPath(id: string) {
    return join(this.storageDir, `${id}.json`);
  }

  private normalizeSeries(series: SeriesRecord): SeriesRecord {
    return {
      ...series,
      visualStyle: mergeVisualStyle(series.visualStyle),
      characters: Array.isArray(series.characters) ? series.characters : [],
    };
  }

  private async readSeries(id: string): Promise<SeriesRecord> {
    try {
      const raw = await readFile(this.seriesPath(id), 'utf8');
      return JSON.parse(raw) as SeriesRecord;
    } catch {
      throw new NotFoundException(`Series ${id} not found`);
    }
  }

  private async countProjectsBySeries(): Promise<Map<string, number>> {
    const counts = new Map<string, number>();

    try {
      const entries = await readdir(this.projectStorageDir, {
        withFileTypes: true,
      });

      await Promise.all(
        entries
          .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
          .map(async (entry) => {
            const raw = await readFile(
              join(this.projectStorageDir, entry.name),
              'utf8',
            );
            const project = JSON.parse(raw) as { seriesId?: string | null };
            if (!project.seriesId) {
              return;
            }
            counts.set(
              project.seriesId,
              (counts.get(project.seriesId) ?? 0) + 1,
            );
          }),
      );
    } catch {
      return counts;
    }

    return counts;
  }

  async listSeries(): Promise<SeriesSummary[]> {
    const entries = await readdir(this.storageDir, { withFileTypes: true });
    const projectCounts = await this.countProjectsBySeries();

    const seriesList = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map(async (entry) => {
          const raw = await readFile(join(this.storageDir, entry.name), 'utf8');
          const series = this.normalizeSeries(JSON.parse(raw) as SeriesRecord);
          return {
            id: series.id,
            name: series.name,
            characterCount: series.characters.length,
            projectCount: projectCounts.get(series.id) ?? 0,
            updatedAt: series.updatedAt,
          } satisfies SeriesSummary;
        }),
    );

    return seriesList.sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    );
  }

  async getSeries(id: string): Promise<SeriesRecord> {
    return this.normalizeSeries(await this.readSeries(id));
  }

  async createSeries(body: CreateSeriesRequestDto = {}): Promise<SeriesRecord> {
    const now = new Date().toISOString();
    const series: SeriesRecord = {
      id: randomUUID(),
      name: body.name?.trim() || 'Untitled series',
      description: body.description?.trim() || '',
      createdAt: now,
      updatedAt: now,
      visualStyle: mergeVisualStyle(body.visualStyle),
      characters: [],
    };

    await writeFile(
      this.seriesPath(series.id),
      JSON.stringify(series, null, 2),
      'utf8',
    );

    return series;
  }

  async updateSeries(
    id: string,
    body: UpdateSeriesRequestDto,
  ): Promise<SeriesRecord> {
    const existing = await this.readSeries(id);
    const series: SeriesRecord = {
      ...existing,
      name: body.name?.trim() || existing.name,
      description:
        body.description !== undefined
          ? body.description.trim()
          : existing.description,
      visualStyle: body.visualStyle
        ? mergeVisualStyle({ ...existing.visualStyle, ...body.visualStyle })
        : existing.visualStyle,
      characters: body.characters ?? existing.characters,
      updatedAt: new Date().toISOString(),
    };

    await writeFile(
      this.seriesPath(series.id),
      JSON.stringify(series, null, 2),
      'utf8',
    );

    return this.normalizeSeries(series);
  }

  async mergeCharacters(
    id: string,
    incoming: StoryCharacter[],
  ): Promise<SeriesRecord> {
    if (incoming.length === 0) {
      return this.getSeries(id);
    }

    const existing = await this.getSeries(id);
    return this.updateSeries(id, {
      characters: mergeCharacterLibraries(existing.characters, incoming),
    });
  }

  async deleteSeries(id: string): Promise<void> {
    await this.readSeries(id);
    await unlink(this.seriesPath(id));
  }
}
