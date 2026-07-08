import {
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import {
  createEmptyProjectState,
  CreateProjectRequestDto,
  type ProjectRecord,
  type ProjectState,
  type ProjectSummary,
  UpdateProjectRequestDto,
} from '../models/project.model';

import { mergeVisualStyle } from '../models/series.model';
import { SeriesService } from './series.service';

@Injectable()
export class ProjectService implements OnModuleInit {
  private readonly storageDir =
    process.env.PROJECT_STORAGE_DIR ??
    join(process.cwd(), 'storage', 'projects');

  constructor(private readonly seriesService: SeriesService) {}

  async onModuleInit() {
    await mkdir(this.storageDir, { recursive: true });
  }

  private projectPath(id: string) {
    return join(this.storageDir, `${id}.json`);
  }

  private toSummary(project: ProjectRecord): ProjectSummary {
    return {
      id: project.id,
      name: project.name,
      topic: project.state.topic,
      seriesId: project.seriesId ?? project.state.seriesId ?? null,
      currentStep: project.state.currentStep,
      updatedAt: project.updatedAt,
    };
  }

  private mergeState(partial?: Partial<ProjectState>): ProjectState {
    const defaults = createEmptyProjectState();
    if (!partial) {
      return defaults;
    }

    return {
      ...defaults,
      ...partial,
      scriptScenes: partial.scriptScenes ?? defaults.scriptScenes,
      characters: partial.characters ?? defaults.characters,
      seriesId: partial.seriesId ?? defaults.seriesId,
      sourceProjectId: partial.sourceProjectId ?? defaults.sourceProjectId,
      knowledgeSourceId: partial.knowledgeSourceId ?? defaults.knowledgeSourceId,
      sourceFidelityMode:
        partial.sourceFidelityMode ?? defaults.sourceFidelityMode,
      visualStyle: mergeVisualStyle(partial.visualStyle ?? defaults.visualStyle),
      promptedScenes: partial.promptedScenes ?? defaults.promptedScenes,
      imageScenes: partial.imageScenes ?? defaults.imageScenes,
      videoScenes: partial.videoScenes ?? defaults.videoScenes,
      audioScenes: partial.audioScenes ?? defaults.audioScenes,
      finalVideoPath: partial.finalVideoPath ?? defaults.finalVideoPath,
      failedStep: partial.failedStep ?? defaults.failedStep,
      pipelineError: partial.pipelineError ?? defaults.pipelineError,
      expandedSteps: {
        ...defaults.expandedSteps,
        ...partial.expandedSteps,
      },
    };
  }

  private normalizeProject(project: ProjectRecord): ProjectRecord {
    return {
      ...project,
      state: this.mergeState(project.state),
    };
  }

  private async readProject(id: string): Promise<ProjectRecord> {
    try {
      const raw = await readFile(this.projectPath(id), 'utf8');
      return JSON.parse(raw) as ProjectRecord;
    } catch {
      throw new NotFoundException(`Project ${id} not found`);
    }
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const entries = await readdir(this.storageDir, { withFileTypes: true });
    const projects = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map(async (entry) => {
          const raw = await readFile(join(this.storageDir, entry.name), 'utf8');
          return JSON.parse(raw) as ProjectRecord;
        }),
    );

    return projects
      .map((project) => this.toSummary(project))
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime(),
      );
  }

  async getProject(id: string): Promise<ProjectRecord> {
    return this.normalizeProject(await this.readProject(id));
  }

  async createProject(body: CreateProjectRequestDto = {}): Promise<ProjectRecord> {
    const now = new Date().toISOString();
    const seriesId = body.seriesId?.trim() || body.state?.seriesId?.trim() || null;
    let state = this.mergeState(body.state);

    if (seriesId) {
      const series = await this.seriesService.getSeries(seriesId);
      state = {
        ...state,
        seriesId,
        visualStyle: mergeVisualStyle(series.visualStyle),
      };
    }

    const name =
      body.name?.trim() ||
      state.topic.trim() ||
      'Untitled project';

    const project: ProjectRecord = {
      id: randomUUID(),
      name,
      seriesId,
      createdAt: now,
      updatedAt: now,
      state,
    };

    await writeFile(
      this.projectPath(project.id),
      JSON.stringify(project, null, 2),
      'utf8',
    );

    return project;
  }

  async updateProject(
    id: string,
    body: UpdateProjectRequestDto,
  ): Promise<ProjectRecord> {
    const existing = await this.readProject(id);
    const state = body.state
      ? this.mergeState(body.state)
      : existing.state;
    const name = body.name?.trim() || existing.name;
    const topic = state.topic.trim();

    const project: ProjectRecord = {
      ...existing,
      name: name === 'Untitled project' && topic ? topic : name,
      seriesId: state.seriesId ?? existing.seriesId ?? null,
      updatedAt: new Date().toISOString(),
      state: {
        ...state,
        seriesId: state.seriesId ?? existing.seriesId ?? null,
      },
    };

    await writeFile(
      this.projectPath(project.id),
      JSON.stringify(project, null, 2),
      'utf8',
    );

    return project;
  }

  async deleteProject(id: string): Promise<void> {
    await this.readProject(id);
    await unlink(this.projectPath(id));
  }
}
