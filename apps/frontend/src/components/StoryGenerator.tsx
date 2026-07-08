import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  generateCharacterProfile,
  generateIdea,
  generateImage,
  generatePrompt,
  generateScript,
  generateStory,
  generateVideo,
  generateAudio,
  assembleVideo,
  upscaleScene,
  uploadSceneVideo,
} from '../api/generate';
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from '../api/projects';
import {
  createSeries,
  listSeries,
  updateSeries,
} from '../api/series';
import { ProjectSidebar } from './ProjectSidebar';
import type {
  PipelineStep,
  SceneScript,
  StoryCharacter,
  StoryLanguage,
  VideoGenerationMode,
} from '../types/content';
import {
  formatSceneDialogue,
  getSceneDialogue,
} from '../utils/characters';
import {
  ACTIVE_PROJECT_STORAGE_KEY,
  createEmptyProjectState,
  getStepLabel,
  mergeProjectState,
  type ProjectState,
  type ProjectSummary,
  type SaveStatus,
} from '../types/project';
import {
  ACTIVE_SERIES_STORAGE_KEY,
  getAnimationStyleLabel,
  getOrientationLabel,
  mergeVisualStyle,
  type SeriesSummary,
  type SeriesVisualStyle,
} from '../types/series';
import {
  getResumeProgressLabel,
  inferInterruptedStep,
  resolveEffectiveReviewStep,
  serializePipelineState,
  shouldReviewImagesStep,
} from '../utils/pipeline-state';
import {
  buildVideoVariantState,
  hasReusableStoryContent,
} from '../utils/story-content';
import { KnowledgePanel } from './KnowledgePanel';

const EXAMPLE_TOPICS: string[] = [
  'Ramayana — Rama and Hanuman',
  'Time Traveler',
  'Lost in the Metaverse',
  'The Last Lighthouse Keeper',
];

function getStoryLanguageLabel(language: StoryLanguage): string {
  return language === 'hi' ? 'Hindi dialogue' : 'English';
}

const STEPS: { id: PipelineStep; label: string }[] = [
  { id: 'idea', label: 'Idea' },
  { id: 'story', label: 'Story' },
  { id: 'script', label: 'Script' },
  { id: 'character', label: 'Character' },
  { id: 'visual', label: 'Visual settings' },
  { id: 'prompts', label: 'Video prompts' },
  { id: 'images', label: 'Images' },
  { id: 'videos', label: 'Scene videos (1080p)' },
  { id: 'audio', label: 'Narration audio' },
  { id: 'assembly', label: 'Final video' },
];

const STEP_ORDER: PipelineStep[] = [
  'idea',
  'story',
  'script',
  'character',
  'visual',
  'prompts',
  'images',
  'videos',
  'audio',
  'assembly',
];

function getNextStep(step: PipelineStep): PipelineStep | 'complete' {
  const index = STEP_ORDER.indexOf(step);
  if (index === -1 || index === STEP_ORDER.length - 1) {
    return 'complete';
  }
  return STEP_ORDER[index + 1];
}

function getStepNumber(step: PipelineStep): number {
  const index = STEP_ORDER.indexOf(step);
  return index === -1 ? 0 : index + 1;
}

function countUpscaledScenes(scenes: SceneScript[]): number {
  return scenes.filter((scene) => scene.upscaledVideoPath?.trim()).length;
}

function normalizeLegacyStep(step: PipelineStep | null): PipelineStep | null {
  if ((step as string | null) === 'upscale') {
    return 'videos';
  }

  return step;
}

async function upscaleSceneVideo(
  scene: SceneScript,
  visualStyle: SeriesVisualStyle,
): Promise<SceneScript> {
  if (!scene.videoPath?.trim()) {
    throw new Error(`Scene ${scene.sceneNumber} is missing a source video.`);
  }

  const response = await upscaleScene({ scene, visualStyle });
  return sanitizeVideoScenes([response.scene])[0];
}

async function generateVideoAndUpscale(
  imageScene: SceneScript,
  visualStyle: SeriesVisualStyle,
): Promise<SceneScript> {
  const videoResponse = await generateVideo({ scene: imageScene, visualStyle });
  return upscaleSceneVideo(videoResponse.scene, visualStyle);
}

function sanitizeVideoScenes(scenes: SceneScript[]): SceneScript[] {
  return scenes.map((scene) => {
    if (!scene.upscaledVideoPath?.trim()) {
      return scene;
    }

    const { videoPath: _videoPath, ...rest } = scene;
    return rest;
  });
}

function buildAssemblyScenes(
  videoScenes: SceneScript[],
  audioScenes: SceneScript[],
): SceneScript[] {
  const orderedVideos = sanitizeVideoScenes(sortScenesByNumber(videoScenes));

  return orderedVideos.map((videoScene) => {
    const audioScene = audioScenes.find(
      (entry) => entry.sceneNumber === videoScene.sceneNumber,
    );

    if (!audioScene) {
      return videoScene;
    }

    return {
      ...videoScene,
      audioPath: audioScene.audioPath ?? videoScene.audioPath,
      narration: audioScene.narration ?? videoScene.narration,
      subtitleCues: audioScene.subtitleCues ?? videoScene.subtitleCues,
      dialogue: audioScene.dialogue ?? videoScene.dialogue,
      dialogueSegments:
        audioScene.dialogueSegments ?? videoScene.dialogueSegments,
      duration: audioScene.duration ?? videoScene.duration,
    };
  });
}

export function StoryGenerator() {
  const [topic, setTopic] = useState('');
  const [storyLanguage, setStoryLanguage] = useState<StoryLanguage>('en');
  const [videoGenerationMode, setVideoGenerationMode] =
    useState<VideoGenerationMode>('local');
  const [currentStep, setCurrentStep] = useState<PipelineStep>('topic');
  const [reviewStep, setReviewStep] = useState<PipelineStep | null>(null);
  const [generatingStep, setGeneratingStep] = useState<PipelineStep | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [failedStep, setFailedStep] = useState<PipelineStep | null>(null);

  const [idea, setIdea] = useState<string | null>(null);
  const [story, setStory] = useState<string | null>(null);
  const [scriptScenes, setScriptScenes] = useState<SceneScript[]>([]);
  const [promptedScenes, setPromptedScenes] = useState<SceneScript[]>([]);
  const [imageScenes, setImageScenes] = useState<SceneScript[]>([]);
  const [videoScenes, setVideoScenes] = useState<SceneScript[]>([]);
  const [audioScenes, setAudioScenes] = useState<SceneScript[]>([]);
  const [finalVideoPath, setFinalVideoPath] = useState<string | null>(null);
  const [characters, setCharacters] = useState<StoryCharacter[]>([]);
  const [castReferenceImagePath, setCastReferenceImagePath] = useState<string | null>(null);
  const [reusedCharacterNames, setReusedCharacterNames] = useState<string[]>([]);
  const [seriesId, setSeriesId] = useState<string | null>(null);
  const [knowledgeSourceId, setKnowledgeSourceId] = useState<string | null>(null);
  const [sourceFidelityMode, setSourceFidelityMode] = useState(false);
  const [sourceProjectId, setSourceProjectId] = useState<string | null>(null);
  const [visualStyle, setVisualStyle] = useState<SeriesVisualStyle>(
    mergeVisualStyle(),
  );
  const [seriesList, setSeriesList] = useState<SeriesSummary[]>([]);
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  const [seriesName, setSeriesName] = useState('');
  const [loadingSeries, setLoadingSeries] = useState(true);
  const [sceneProgressIndex, setSceneProgressIndex] = useState(0);
  const [regeneratingSceneIndex, setRegeneratingSceneIndex] = useState<
    number | null
  >(null);
  const [approvedThroughIndex, setApprovedThroughIndex] = useState(-1);
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({
    1: false,
    2: false,
    3: false,
    4: false,
    5: false,
    6: false,
    7: false,
    8: false,
    9: false,
  });
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('Untitled project');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [switchingProject, setSwitchingProject] = useState(false);

  const pipelineStarted = currentStep !== 'topic';
  const loading = generatingStep !== null;
  const resultsRef = useRef<HTMLDivElement>(null);
  const skipSaveRef = useRef(true);
  const saveTimerRef = useRef<number | null>(null);

  const hasResults =
    idea ||
    story ||
    scriptScenes.length > 0 ||
    characters.length > 0 ||
    promptedScenes.length > 0 ||
    imageScenes.length > 0 ||
    videoScenes.length > 0 ||
    audioScenes.length > 0 ||
    finalVideoPath;

  const introCompact = pipelineStarted || hasResults;

  const applyProjectState = useCallback((state: ProjectState | Partial<ProjectState>) => {
    const normalized = mergeProjectState(state);
    setTopic(normalized.topic);
    setStoryLanguage(normalized.storyLanguage);
    setVideoGenerationMode(normalized.videoGenerationMode);
    setCurrentStep(
      normalizeLegacyStep(normalized.currentStep) ?? normalized.currentStep,
    );
    setIdea(normalized.idea);
    setStory(normalized.story);
    setScriptScenes(normalized.scriptScenes);
    setCharacters(normalized.characters);
    setCastReferenceImagePath(normalized.castReferenceImagePath ?? null);
    setSeriesId(normalized.seriesId ?? null);
    setKnowledgeSourceId(normalized.knowledgeSourceId ?? null);
    setSourceFidelityMode(Boolean(normalized.sourceFidelityMode));
    setSourceProjectId(normalized.sourceProjectId ?? null);
    setVisualStyle(mergeVisualStyle(normalized.visualStyle));
    if (normalized.seriesId) {
      setActiveSeriesId(normalized.seriesId);
    }
    setReusedCharacterNames([]);
    setPromptedScenes(normalized.promptedScenes);
    setImageScenes(normalized.imageScenes);
    setVideoScenes(sanitizeVideoScenes(normalized.videoScenes));
    setAudioScenes(normalized.audioScenes);
    setFinalVideoPath(normalized.finalVideoPath);
    setApprovedThroughIndex(normalized.approvedThroughIndex);
    setExpandedSteps(normalized.expandedSteps);
    const interruptedStep = inferInterruptedStep(normalized);
    let nextFailedStep = normalized.failedStep ?? interruptedStep;
    if ((nextFailedStep as string | null) === 'upscale') {
      nextFailedStep = 'videos';
    }
    let nextReviewStep = normalizeLegacyStep(normalized.reviewStep);
    let nextPipelineError = normalized.pipelineError;

    if (
      shouldReviewImagesStep({
        ...normalized,
        failedStep: nextFailedStep,
        reviewStep: nextReviewStep,
      })
    ) {
      nextReviewStep = 'images';
      nextFailedStep = null;
      nextPipelineError = null;
    }

    setReviewStep(nextReviewStep);
    setFailedStep(nextFailedStep);
    setGeneratingStep(null);
    setRegeneratingSceneIndex(null);
    setSceneProgressIndex(0);
    setError(
      nextPipelineError ??
        (nextFailedStep
          ? 'Generation was interrupted. Resume to continue from where you left off.'
          : null),
    );
  }, []);

  const getSourceFidelityRequest = useCallback(
    () => ({
      knowledgeSourceId: sourceFidelityMode ? knowledgeSourceId : null,
      sourceFidelityMode,
    }),
    [knowledgeSourceId, sourceFidelityMode],
  );

  const getPersistedState = useCallback(
    (): ProjectState =>
      serializePipelineState({
        topic,
        storyLanguage,
        videoGenerationMode,
        currentStep,
        reviewStep,
        idea,
        story,
        scriptScenes,
        characters,
        castReferenceImagePath,
        seriesId,
        sourceProjectId,
        knowledgeSourceId,
        sourceFidelityMode,
        visualStyle,
        promptedScenes,
        imageScenes,
        videoScenes: sanitizeVideoScenes(videoScenes),
        audioScenes,
        finalVideoPath,
        approvedThroughIndex,
        expandedSteps,
        failedStep,
        pipelineError: failedStep ? error : null,
      }),
    [
      topic,
      storyLanguage,
      videoGenerationMode,
      currentStep,
      reviewStep,
      idea,
      story,
      scriptScenes,
      characters,
      castReferenceImagePath,
      seriesId,
      sourceProjectId,
      knowledgeSourceId,
      sourceFidelityMode,
      visualStyle,
      promptedScenes,
      imageScenes,
      videoScenes,
      audioScenes,
      finalVideoPath,
      approvedThroughIndex,
      expandedSteps,
      failedStep,
      error,
    ],
  );

  const refreshSeriesList = useCallback(async () => {
    const summaries = await listSeries();
    setSeriesList(summaries);
    if (activeSeriesId) {
      const active = summaries.find((series) => series.id === activeSeriesId);
      if (active) {
        setSeriesName(active.name);
      }
    }
    return summaries;
  }, [activeSeriesId]);

  const refreshProjectList = useCallback(async () => {
    const summaries = await listProjects();
    setProjects(summaries);
    return summaries;
  }, []);

  const persistActiveProject = useCallback(
    async (options?: { name?: string; state?: ProjectState }) => {
      if (!activeProjectId) {
        return;
      }

      setSaveStatus('saving');
      try {
        const updated = await updateProject(activeProjectId, {
          name: options?.name ?? projectName,
          state: options?.state ?? getPersistedState(),
        });
        setProjectName(updated.name);
        setProjects((current) => {
          const next = current.filter((project) => project.id !== updated.id);
          next.unshift({
            id: updated.id,
            name: updated.name,
            topic: updated.state.topic,
            seriesId: updated.seriesId ?? updated.state.seriesId ?? null,
            currentStep: updated.state.currentStep,
            updatedAt: updated.updatedAt,
          });
          return next.sort(
            (left, right) =>
              new Date(right.updatedAt).getTime() -
              new Date(left.updatedAt).getTime(),
          );
        });
        setSaveStatus('saved');
      } catch (err) {
        setSaveStatus('error');
        throw err;
      }
    },
    [activeProjectId, getPersistedState, projectName],
  );

  const loadProjectById = useCallback(
    async (projectId: string) => {
      skipSaveRef.current = true;
      setSwitchingProject(true);
      try {
        const project = await getProject(projectId);
        applyProjectState({
          ...project.state,
          seriesId: project.seriesId ?? project.state.seriesId ?? null,
        });
        setActiveProjectId(project.id);
        setProjectName(project.name);
        if (project.seriesId ?? project.state.seriesId) {
          setActiveSeriesId(project.seriesId ?? project.state.seriesId ?? null);
        }
        localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, project.id);
        await refreshProjectList();
      } finally {
        setSwitchingProject(false);
        window.setTimeout(() => {
          skipSaveRef.current = false;
        }, 0);
      }
    },
    [applyProjectState, refreshProjectList],
  );

  useEffect(() => {
    async function bootstrapSeries() {
      setLoadingSeries(true);
      try {
        const summaries = await refreshSeriesList();
        const storedSeriesId = localStorage.getItem(ACTIVE_SERIES_STORAGE_KEY);
        if (
          storedSeriesId &&
          summaries.some((series) => series.id === storedSeriesId)
        ) {
          setActiveSeriesId(storedSeriesId);
          const active = summaries.find((series) => series.id === storedSeriesId);
          setSeriesName(active?.name ?? '');
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load saved series.',
        );
      } finally {
        setLoadingSeries(false);
      }
    }

    void bootstrapSeries();
  }, [refreshSeriesList]);

  useEffect(() => {
    async function bootstrapProjects() {
      setLoadingProjects(true);
      try {
        const summaries = await refreshProjectList();
        const storedId = localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
        const initialId =
          storedId && summaries.some((project) => project.id === storedId)
            ? storedId
            : summaries[0]?.id;

        if (initialId) {
          await loadProjectById(initialId);
        } else {
          const created = await createProject({
            name: 'Untitled project',
            seriesId: activeSeriesId,
          });
          await refreshProjectList();
          await loadProjectById(created.id);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load saved projects.',
        );
      } finally {
        setLoadingProjects(false);
      }
    }

    void bootstrapProjects();
  }, [activeSeriesId, loadProjectById, refreshProjectList]);

  useEffect(() => {
    if (!activeProjectId || skipSaveRef.current || loading || switchingProject) {
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      void persistActiveProject().catch((err) => {
        setSaveStatus('error');
        setError(
          err instanceof Error
            ? `Project save failed: ${err.message}`
            : 'Project save failed.',
        );
      });
    }, 700);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [
    activeProjectId,
    loading,
    switchingProject,
    persistActiveProject,
    topic,
    storyLanguage,
    videoGenerationMode,
    currentStep,
    reviewStep,
    idea,
    story,
    scriptScenes,
    characters,
    promptedScenes,
    imageScenes,
    videoScenes,
    audioScenes,
    finalVideoPath,
    approvedThroughIndex,
    expandedSteps,
    failedStep,
    error,
    projectName,
  ]);

  useEffect(() => {
    if (loading) {
      document.body.style.overflow = 'hidden';
      return;
    }

    document.body.style.overflow = '';

    return () => {
      document.body.style.overflow = '';
    };
  }, [loading]);

  useEffect(() => {
    if (!reviewStep || loading) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [reviewStep, loading]);

  useEffect(() => {
    if (!failedStep || loading || reviewStep) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [failedStep, loading, reviewStep]);

  useEffect(() => {
    if (loading || reviewStep) {
      return;
    }

    if (
      !shouldReviewImagesStep({
        reviewStep,
        approvedThroughIndex,
        promptedScenes,
        imageScenes,
        currentStep,
        failedStep,
      })
    ) {
      return;
    }

    setReviewStep('images');
    setFailedStep(null);
    setError(null);
  }, [
    loading,
    reviewStep,
    approvedThroughIndex,
    promptedScenes,
    imageScenes,
    currentStep,
    failedStep,
  ]);

  function resetPipelineState() {
    applyProjectState(createEmptyProjectState());
  }

  async function handleCreateSeries() {
    if (switchingProject) {
      return;
    }

    try {
      const created = await createSeries({ name: 'Untitled series' });
      await refreshSeriesList();
      setActiveSeriesId(created.id);
      setSeriesName(created.name);
      localStorage.setItem(ACTIVE_SERIES_STORAGE_KEY, created.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create a new series.',
      );
    }
  }

  function handleSelectSeries(nextSeriesId: string | null) {
    setActiveSeriesId(nextSeriesId);
    if (nextSeriesId) {
      localStorage.setItem(ACTIVE_SERIES_STORAGE_KEY, nextSeriesId);
      const active = seriesList.find((series) => series.id === nextSeriesId);
      setSeriesName(active?.name ?? '');
    } else {
      localStorage.removeItem(ACTIVE_SERIES_STORAGE_KEY);
      setSeriesName('');
    }
  }

  async function handleRenameSeries(name: string) {
    setSeriesName(name);
    if (!activeSeriesId) {
      return;
    }

    try {
      await updateSeries(activeSeriesId, { name });
      await refreshSeriesList();
    } catch (err) {
      setSaveStatus('error');
      setError(
        err instanceof Error ? err.message : 'Failed to rename series.',
      );
    }
  }

  async function handleCreateProject() {
    if (switchingProject) {
      return;
    }

    try {
      if (activeProjectId) {
        await persistActiveProject();
      }
      const created = await createProject({
        name: 'Untitled project',
        seriesId: activeSeriesId,
      });
      await refreshProjectList();
      await loadProjectById(created.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create a new project.',
      );
    }
  }

  async function handleSelectProject(projectId: string) {
    if (projectId === activeProjectId || switchingProject) {
      return;
    }

    try {
      if (activeProjectId) {
        await persistActiveProject();
      }
      await loadProjectById(projectId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to switch projects.',
      );
    }
  }

  async function handleDeleteProject(projectId: string) {
    const project = projects.find((entry) => entry.id === projectId);
    const label = project?.name ?? 'this project';
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) {
      return;
    }

    try {
      await deleteProject(projectId);
      const summaries = await refreshProjectList();

      if (projectId !== activeProjectId) {
        return;
      }

      if (summaries[0]) {
        await loadProjectById(summaries[0].id);
        return;
      }

      const created = await createProject({
        name: 'Untitled project',
        seriesId: activeSeriesId,
      });
      await refreshProjectList();
      await loadProjectById(created.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to delete project.',
      );
    }
  }

  function handleRenameProject(name: string) {
    setProjectName(name);
  }

  function resetPipeline() {
    resetPipelineState();
  }

  function startWithTopic(selectedTopic: string) {
    setTopic(selectedTopic);
    setError(null);
  }

  function toggleStep(step: number) {
    setExpandedSteps((current) => ({
      ...current,
      [step]: !current[step],
    }));
  }

  function expandAllSteps() {
    setExpandedSteps({
      1: true,
      2: true,
      3: true,
      4: true,
      5: true,
      6: true,
      7: true,
      8: true,
      9: true,
      10: true,
    });
  }

  function collapseAllSteps() {
    setExpandedSteps({
      1: false,
      2: false,
      3: false,
      4: false,
      5: false,
      6: false,
      7: false,
      8: false,
      9: false,
      10: false,
    });
  }

  function revealStep(step: number) {
    setExpandedSteps((current) => ({
      ...current,
      [step]: true,
    }));
  }

  function clearFromStep(step: PipelineStep) {
    switch (step) {
      case 'idea':
        setIdea(null);
        setStory(null);
        setScriptScenes([]);
        setCharacters([]);
        setPromptedScenes([]);
        setImageScenes([]);
        setVideoScenes([]);
        setAudioScenes([]);
        setFinalVideoPath(null);
        break;
      case 'story':
        setStory(null);
        setScriptScenes([]);
        setCharacters([]);
        setPromptedScenes([]);
        setImageScenes([]);
        setVideoScenes([]);
        setAudioScenes([]);
        setFinalVideoPath(null);
        break;
      case 'script':
        setScriptScenes([]);
        setCharacters([]);
        setPromptedScenes([]);
        setImageScenes([]);
        setVideoScenes([]);
        setAudioScenes([]);
        setFinalVideoPath(null);
        break;
      case 'character':
        setCharacters([]);
        setPromptedScenes([]);
        setImageScenes([]);
        setVideoScenes([]);
        setAudioScenes([]);
        setFinalVideoPath(null);
        break;
      case 'visual':
        setPromptedScenes([]);
        setImageScenes([]);
        setVideoScenes([]);
        setAudioScenes([]);
        setFinalVideoPath(null);
        break;
      case 'prompts':
        setPromptedScenes([]);
        setImageScenes([]);
        setVideoScenes([]);
        setAudioScenes([]);
        setFinalVideoPath(null);
        break;
      case 'images':
        setImageScenes([]);
        setVideoScenes([]);
        setAudioScenes([]);
        setFinalVideoPath(null);
        break;
      case 'videos':
        setVideoScenes([]);
        setAudioScenes([]);
        setFinalVideoPath(null);
        break;
      case 'audio':
        setAudioScenes([]);
        setFinalVideoPath(null);
        break;
      case 'assembly':
        setFinalVideoPath(null);
        break;
      default:
        break;
    }
  }

  async function runStep(
    step: PipelineStep,
    options: { resume?: boolean } = {},
  ) {
    setError(null);
    setFailedStep(null);
    setGeneratingStep(step);
    setReviewStep(null);
    setCurrentStep(step);

    try {
      switch (step) {
        case 'idea': {
          const trimmedTopic = topic.trim();
          if (!trimmedTopic) {
            throw new Error('Please enter a topic.');
          }
          const response = await generateIdea({
            topic: trimmedTopic,
            storyLanguage,
            ...getSourceFidelityRequest(),
          });
          setIdea(response.idea);
          revealStep(1);
          break;
        }
        case 'story': {
          if (!idea) {
            throw new Error('Generate an idea first.');
          }
          const response = await generateStory({
            idea,
            storyLanguage,
            ...getSourceFidelityRequest(),
          });
          setStory(response.story);
          revealStep(2);
          break;
        }
        case 'script': {
          if (!story) {
            throw new Error('Generate a story first.');
          }
          const response = await generateScript({
            story,
            storyLanguage,
            ...getSourceFidelityRequest(),
          });
          setScriptScenes(response.script);
          revealStep(3);
          break;
        }
        case 'character': {
          if (!story || scriptScenes.length === 0) {
            throw new Error('Generate a script first.');
          }
          const response = await generateCharacterProfile({
            story,
            script: scriptScenes,
            storyLanguage,
            seriesId,
            visualStyle,
            ...getSourceFidelityRequest(),
          });
          setCharacters(response.characters);
          setCastReferenceImagePath(response.castReferenceImagePath ?? null);
          setScriptScenes(response.script);
          setReusedCharacterNames(response.reusedCharacters);
          await refreshSeriesList();
          revealStep(4);
          break;
        }
        case 'prompts': {
          if (characters.length === 0 || scriptScenes.length === 0) {
            throw new Error('Define character profiles first.');
          }
          const startIndex = options.resume ? promptedScenes.length : 0;
          const scenesWithPrompts = options.resume ? [...promptedScenes] : [];
          for (let index = startIndex; index < scriptScenes.length; index++) {
            setSceneProgressIndex(index);
            const response = await generatePrompt({
              scene: scriptScenes[index],
              characters,
              videoMode: videoGenerationMode,
              storyLanguage,
              visualStyle,
              ...getSourceFidelityRequest(),
            });
            scenesWithPrompts.push(response.scene);
            setPromptedScenes([...scenesWithPrompts]);
          }
          revealStep(6);
          break;
        }
        case 'images': {
          if (promptedScenes.length === 0) {
            throw new Error('Generate video prompts first.');
          }
          const startIndex = options.resume ? imageScenes.length : 0;
          const scenesWithImages = options.resume ? [...imageScenes] : [];
          for (let index = startIndex; index < promptedScenes.length; index++) {
            setSceneProgressIndex(index);
            const response = await generateImage({
              scene: promptedScenes[index],
              visualStyle,
              characters,
              castReferenceImagePath: castReferenceImagePath ?? undefined,
            });
            scenesWithImages.push(response.scene);
            setImageScenes([...scenesWithImages]);
          }
          revealStep(7);
          break;
        }
        case 'videos': {
          if (imageScenes.length === 0) {
            throw new Error('Generate scene images first.');
          }

          if (videoGenerationMode === 'professional') {
            revealStep(8);
            break;
          }

          const orderedScenes = sortScenesByNumber(imageScenes);
          const startIndex = options.resume
            ? countUpscaledScenes(videoScenes)
            : videoScenes.length;

          if (startIndex >= orderedScenes.length) {
            revealStep(8);
            break;
          }

          if (!options.resume && videoScenes.length === 0) {
            setVideoScenes([]);
            setAudioScenes([]);
            setFinalVideoPath(null);
          }

          if (options.resume) {
            const scenesWithVideo = [...videoScenes];
            for (let index = startIndex; index < orderedScenes.length; index++) {
              const imageScene = orderedScenes[index];
              const existing = scenesWithVideo[index];
              if (existing?.upscaledVideoPath?.trim()) {
                continue;
              }

              setSceneProgressIndex(index);
              const upscaledScene = existing?.videoPath?.trim()
                ? await upscaleSceneVideo(existing, visualStyle)
                : await generateVideoAndUpscale(imageScene, visualStyle);
              scenesWithVideo[index] = upscaledScene;
              setVideoScenes(sanitizeVideoScenes([...scenesWithVideo]));
            }
            revealStep(8);
            break;
          }

          const scene = orderedScenes[startIndex];
          if (!scene.videoPrompt?.trim()) {
            throw new Error(
              `Scene ${scene.sceneNumber} is missing a video prompt.`,
            );
          }
          if (!scene.imagePath) {
            throw new Error(
              `Scene ${scene.sceneNumber} is missing a generated image.`,
            );
          }

          setSceneProgressIndex(startIndex);
          const upscaledScene = await generateVideoAndUpscale(scene, visualStyle);
          setVideoScenes((current) => {
            const next = [...current];
            next[startIndex] = upscaledScene;
            return next.slice(0, startIndex + 1);
          });
          revealStep(8);
          break;
        }
        case 'audio': {
          if (videoScenes.length === 0) {
            throw new Error('Generate scene videos first.');
          }
          if (countUpscaledScenes(videoScenes) < videoScenes.length) {
            throw new Error('Finish generating 1080p scene videos first.');
          }
          const orderedScenes = sortScenesByNumber(videoScenes);
          const startIndex = options.resume ? audioScenes.length : 0;
          const scenesWithAudio = options.resume ? [...audioScenes] : [];
          for (let index = startIndex; index < orderedScenes.length; index++) {
            const scene = orderedScenes[index];
            const scriptScene = scriptScenes.find(
              (entry) => entry.sceneNumber === scene.sceneNumber,
            );
            const spokenScene = scriptScene ?? scene;
            const hasDialogue = getSceneDialogue(spokenScene).length > 0;
            if (!hasDialogue && !spokenScene.narration?.trim()) {
              throw new Error(
                `Scene ${scene.sceneNumber} is missing dialogue text.`,
              );
            }
            setSceneProgressIndex(index);
            const response = await generateAudio({
              scene: { ...spokenScene, ...scene },
              characters,
              storyLanguage,
            });
            scenesWithAudio.push(response.scene);
            setAudioScenes([...scenesWithAudio]);
          }
          revealStep(9);
          break;
        }
        case 'assembly': {
          if (audioScenes.length === 0) {
            throw new Error('Generate narration audio first.');
          }
          const response = await assembleVideo({
            scenes: buildAssemblyScenes(videoScenes, audioScenes),
            projectName: projectName.trim() || topic.trim() || undefined,
          });
          setFinalVideoPath(response.finalVideoPath);
          revealStep(10);
          break;
        }
        default:
          break;
      }

      setReviewStep(step);
      setSceneProgressIndex(0);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong. Try again.';
      setFailedStep(step);
      setError(message);
    } finally {
      setGeneratingStep(null);
    }
  }

  async function resumeFailedStep() {
    if (!failedStep || loading) {
      return;
    }

    await runStep(failedStep, { resume: true });
  }

  async function restartFailedStep() {
    if (!failedStep || loading) {
      return;
    }

    const step = failedStep;
    setError(null);
    setFailedStep(null);
    clearFromStep(step);
    await runStep(step);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTopic = topic.trim();
    if (!trimmedTopic) {
      setError('Please enter a topic.');
      return;
    }

    if (!activeProjectId) {
      try {
        const created = await createProject({
          name: trimmedTopic,
          seriesId: activeSeriesId,
          state: {
            topic: trimmedTopic,
            storyLanguage,
            videoGenerationMode,
          },
        });
        await refreshProjectList();
        await loadProjectById(created.id);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to create project.',
        );
        return;
      }
    }

    clearFromStep('idea');
    setReviewStep(null);
    setFailedStep(null);
    setExpandedSteps({
      1: false,
      2: false,
      3: false,
      4: false,
      5: false,
      6: false,
      7: false,
      8: false,
      9: false,
      10: false,
    });
    await runStep('idea');
  }

  async function createVideoVariant() {
    if (!activeProjectId || !hasReusableStoryContent(getPersistedState())) {
      return;
    }

    try {
      if (activeProjectId) {
        await persistActiveProject();
      }

      const variantState = buildVideoVariantState(
        getPersistedState(),
        activeProjectId,
      );
      const baseName = projectName.trim() || topic.trim() || 'Untitled project';
      const created = await createProject({
        name: `${baseName} — new version`,
        seriesId: activeSeriesId,
        state: variantState,
      });
      await refreshProjectList();
      await loadProjectById(created.id);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to create a new video version.',
      );
    }
  }

  async function approveAndContinue() {
    const step = resolveEffectiveReviewStep({
      reviewStep,
      approvedThroughIndex,
      promptedScenes,
      imageScenes,
      currentStep,
      failedStep,
    });

    if (!step) {
      return;
    }

    if (step === 'character') {
      setApprovedThroughIndex(STEP_ORDER.indexOf('character'));
      setReviewStep('visual');
      setCurrentStep('visual');
      revealStep(5);
      return;
    }

    if (step === 'visual') {
      setApprovedThroughIndex(STEP_ORDER.indexOf('visual'));
      setReviewStep(null);
      await runStep('prompts');
      return;
    }

    if (step === 'videos') {
      if (videoGenerationMode === 'professional') {
        const orderedScenes = sortScenesByNumber(imageScenes);
        if (countUpscaledScenes(videoScenes) < orderedScenes.length) {
          setError('Upload and upscale all scene videos before continuing.');
          return;
        }
      } else {
        const orderedScenes = sortScenesByNumber(imageScenes);
        if (countUpscaledScenes(videoScenes) < orderedScenes.length) {
          setError(null);
          setFailedStep(null);
          setReviewStep(null);
          setGeneratingStep('videos');
          setCurrentStep('videos');

          const nextIndex = countUpscaledScenes(videoScenes);
          const scene = orderedScenes[nextIndex];

          try {
            setSceneProgressIndex(nextIndex);
            const upscaledScene = await generateVideoAndUpscale(scene, visualStyle);
            setVideoScenes((current) => {
              const next = [...current];
              next[nextIndex] = upscaledScene;
              return next.slice(0, nextIndex + 1);
            });
            setReviewStep('videos');
          } catch (err) {
            const message =
              err instanceof Error
                ? err.message
                : 'Something went wrong. Try again.';
            setFailedStep('videos');
            setError(message);
          } finally {
            setGeneratingStep(null);
            setSceneProgressIndex(0);
          }
          return;
        }
      }
    }

    const stepIndex = STEP_ORDER.indexOf(step);
    setApprovedThroughIndex(stepIndex);

    const nextStep = getNextStep(step);
    setReviewStep(null);

    if (nextStep === 'complete') {
      setCurrentStep('complete');
      return;
    }

    await runStep(nextStep);
  }

  async function regenerateCurrentStep() {
    const step = resolveEffectiveReviewStep({
      reviewStep,
      approvedThroughIndex,
      promptedScenes,
      imageScenes,
      currentStep,
      failedStep,
    });

    if (!step) {
      return;
    }

    if (step === 'videos' && videoScenes.length > 0) {
      await regenerateSceneVideo(videoScenes.length - 1);
      return;
    }

    const stepIndex = STEP_ORDER.indexOf(step);
    setApprovedThroughIndex(stepIndex - 1);
    clearFromStep(step);
    await runStep(step);
  }

  async function regenerateScenePrompt(index: number) {
    if (characters.length === 0 || !scriptScenes[index]) {
      return;
    }

    setError(null);
    setRegeneratingSceneIndex(index);

    try {
      const response = await generatePrompt({
        scene: scriptScenes[index],
        characters,
        videoMode: videoGenerationMode,
        storyLanguage,
        visualStyle,
        ...getSourceFidelityRequest(),
      });
      setPromptedScenes((current) => {
        const next = [...current];
        next[index] = response.scene;
        return next;
      });
      setImageScenes((current) => current.slice(0, index));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to regenerate prompt.',
      );
    } finally {
      setRegeneratingSceneIndex(null);
    }
  }

  async function regenerateSceneImage(index: number) {
    const scene = promptedScenes[index];
    if (!scene?.imagePrompt) {
      return;
    }

    setError(null);
    setRegeneratingSceneIndex(index);

    try {
      const response = await generateImage({
        scene,
        visualStyle,
        characters,
        castReferenceImagePath: castReferenceImagePath ?? undefined,
      });
      setImageScenes((current) => {
        const next = [...current];
        next[index] = response.scene;
        return next;
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to regenerate image.',
      );
    } finally {
      setRegeneratingSceneIndex(null);
    }
  }

  async function regenerateSceneAudio(index: number) {
    const scene = audioScenes[index] ?? videoScenes[index];
    const scriptScene = scriptScenes.find(
      (entry) => entry.sceneNumber === scene?.sceneNumber,
    );
    const spokenScene = scriptScene ?? scene;
    const hasDialogue = spokenScene ? getSceneDialogue(spokenScene).length > 0 : false;
    if (!spokenScene || (!hasDialogue && !spokenScene.narration?.trim())) {
      return;
    }

    setError(null);
    setRegeneratingSceneIndex(index);

    try {
      const response = await generateAudio({
        scene: { ...spokenScene, ...scene },
        characters,
        storyLanguage,
      });
      setAudioScenes((current) => {
        const next = [...current];
        next[index] = response.scene;
        return next;
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to regenerate audio.',
      );
    } finally {
      setRegeneratingSceneIndex(null);
    }
  }

  async function uploadProfessionalSceneVideo(index: number, file: File) {
    const scene = sortScenesByNumber(imageScenes)[index];
    if (!scene) {
      return;
    }

    setError(null);
    setRegeneratingSceneIndex(index);

    try {
      const uploaded = await uploadSceneVideo(scene.sceneNumber, file);
      const withVideo = { ...scene, videoPath: uploaded.videoPath };
      const upscaledScene = await upscaleSceneVideo(withVideo, visualStyle);
      setVideoScenes((current) => {
        const next = [...current];
        next[index] = upscaledScene;
        return next.slice(0, index + 1);
      });
      setReviewStep('videos');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to upload scene video.',
      );
    } finally {
      setRegeneratingSceneIndex(null);
    }
  }

  async function regenerateSceneVideo(index: number) {
    const scene = videoScenes[index] ?? imageScenes[index];
    if (!scene?.imagePath || !scene.videoPrompt) {
      return;
    }

    if (videoGenerationMode === 'professional') {
      setVideoScenes((current) => {
        const next = [...current];
        next[index] = {
          ...scene,
          videoPath: undefined,
          upscaledVideoPath: undefined,
        };
        return next;
      });
      return;
    }

    setError(null);
    setRegeneratingSceneIndex(index);

    try {
      const response = await generateVideo({ scene, visualStyle });
      const upscaledScene = await upscaleSceneVideo(response.scene, visualStyle);
      setVideoScenes((current) => {
        const next = [...current];
        next[index] = upscaledScene;
        return next;
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to regenerate video.',
      );
    } finally {
      setRegeneratingSceneIndex(null);
    }
  }

  const effectiveReviewStep = resolveEffectiveReviewStep({
    reviewStep,
    approvedThroughIndex,
    promptedScenes,
    imageScenes,
    currentStep,
    failedStep,
  });

  const orderedImageScenes = sortScenesByNumber(imageScenes);
  const isProfessionalMode = videoGenerationMode === 'professional';
  const hasMoreVideosToGenerate =
    effectiveReviewStep === 'videos' &&
    !isProfessionalMode &&
    countUpscaledScenes(videoScenes) < orderedImageScenes.length;
  const nextProfessionalUploadIndex = videoScenes.length;
  const pendingProfessionalUploadScene =
    orderedImageScenes[nextProfessionalUploadIndex];

  const canCreateVideoVariant = hasReusableStoryContent({
    idea,
    story,
    scriptScenes,
    characters,
    promptedScenes,
  });

  const reviewStepLabel =
    STEPS.find((step) => step.id === effectiveReviewStep)?.label ??
    effectiveReviewStep;

  const resumeProgressLabel = failedStep
    ? getResumeProgressLabel(failedStep, {
        scriptScenes,
        promptedScenes,
        imageScenes,
        videoScenes,
        audioScenes,
        finalVideoPath,
      })
    : null;

  return (
    <div className="app-layout">
      <ProjectSidebar
        seriesList={seriesList}
        activeSeriesId={activeSeriesId}
        activeSeriesName={seriesName}
        projects={projects}
        activeProjectId={activeProjectId}
        activeProjectName={projectName}
        saveStatus={saveStatus}
        loadingSeries={loadingSeries}
        loadingProjects={loadingProjects}
        switchingProject={switchingProject}
        onSelectSeries={handleSelectSeries}
        onCreateSeries={handleCreateSeries}
        onRenameSeries={handleRenameSeries}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
        onDeleteProject={handleDeleteProject}
        onRenameProject={handleRenameProject}
      />

      <div className="app-shell">
      {loading ? (
        <LoadingOverlay
          currentStep={generatingStep ?? currentStep}
          sceneProgressIndex={sceneProgressIndex}
          totalScenes={
            generatingStep === 'audio'
              ? videoScenes.length
              : generatingStep === 'videos'
                ? imageScenes.length
                : generatingStep === 'images'
                  ? promptedScenes.length
                  : generatingStep === 'prompts'
                    ? scriptScenes.length
                    : scriptScenes.length
          }
        />
      ) : null}

      <div className={`page-intro ${introCompact ? 'is-compact' : ''}`}>
        <div className="page-intro-inner">
          {!introCompact ? (
            <header className="hero">
              <p className="eyebrow">AI Story Factory</p>
              <h1>Step-by-step story pipeline</h1>
              <p className="subtitle">
                Pick a topic, review each step before continuing, and regenerate
                any output until you are satisfied.
              </p>
            </header>
          ) : (
            <div className="compact-intro-bar">
              <p className="compact-intro-title">AI Story Factory</p>
              <p className="compact-intro-topic">
                Topic: <strong>{topic || 'Not set'}</strong>
                {' · '}
                Language:{' '}
                <strong>{getStoryLanguageLabel(storyLanguage)}</strong>
                {' · '}
                Video:{' '}
                <strong>
                  {videoGenerationMode === 'professional'
                    ? 'Professional upload'
                    : 'Local generation'}
                </strong>
                {' · '}
                Screen:{' '}
                <strong>{getOrientationLabel(visualStyle.orientation)}</strong>
                {' · '}
                Look:{' '}
                <strong>
                  {getAnimationStyleLabel(visualStyle.animationStyle)}
                </strong>
              </p>
            </div>
          )}

          <section className="panel generator-panel topic-panel">
            <div className="topic-panel-header">
              <div>
                <h2>{introCompact ? 'Topic' : 'Choose a topic'}</h2>
                {!introCompact ? (
                  <p className="muted">
                    Start a new story anytime. Suggested topics are one click away.
                  </p>
                ) : null}
              </div>
              {pipelineStarted ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={resetPipeline}
                  disabled={loading}
                >
                  Clear pipeline
                </button>
              ) : null}
            </div>

            <form className="generator-form" onSubmit={handleSubmit}>
              <label htmlFor="topic">Story topic</label>
              <div className="input-row">
                <input
                  id="topic"
                  name="topic"
                  type="text"
                  placeholder="e.g. Time Traveler"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  disabled={loading || effectiveReviewStep !== null}
                />
                <button
                  type="submit"
                  disabled={loading || effectiveReviewStep !== null}
                >
                  {loading
                    ? 'Generating...'
                    : pipelineStarted
                      ? 'Restart from idea'
                      : 'Start pipeline'}
                </button>
              </div>
            </form>

            <fieldset
              className="video-mode-selector"
              disabled={loading || effectiveReviewStep !== null || pipelineStarted}
            >
              <legend>Story language</legend>
              <div className="video-mode-options">
                <label
                  className={`video-mode-option ${storyLanguage === 'en' ? 'is-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="storyLanguage"
                    value="en"
                    checked={storyLanguage === 'en'}
                    onChange={() => setStoryLanguage('en')}
                  />
                  <span className="video-mode-option-title">English</span>
                  <span className="video-mode-option-copy">
                    Idea, story, script, and dialogue in English.
                  </span>
                </label>
                <label
                  className={`video-mode-option ${storyLanguage === 'hi' ? 'is-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="storyLanguage"
                    value="hi"
                    checked={storyLanguage === 'hi'}
                    onChange={() => setStoryLanguage('hi')}
                  />
                  <span className="video-mode-option-title">Hindi dialogue</span>
                  <span className="video-mode-option-copy">
                    Character spoken lines in Devanagari Hindi. Idea, story,
                    script, and visuals stay in English.
                  </span>
                </label>
              </div>
            </fieldset>

            <fieldset
              className="video-mode-selector source-fidelity-selector"
              disabled={loading || effectiveReviewStep !== null || pipelineStarted}
            >
              <legend>Source fidelity (RAG)</legend>
              <label className="source-fidelity-toggle">
                <input
                  type="checkbox"
                  checked={sourceFidelityMode}
                  onChange={(event) =>
                    setSourceFidelityMode(event.target.checked)
                  }
                  disabled={!knowledgeSourceId}
                />
                <span>
                  Use indexed source material exactly — no invented plot changes
                </span>
              </label>
              <p className="muted source-fidelity-note">
                Select a knowledge source below, index your canonical text (e.g.
                Ramayana), then enable this before starting the pipeline.
              </p>
            </fieldset>

            <fieldset
              className="video-mode-selector"
              disabled={loading || effectiveReviewStep !== null || pipelineStarted}
            >
              <legend>Video generation</legend>
              <div className="video-mode-options">
                <label
                  className={`video-mode-option ${videoGenerationMode === 'local' ? 'is-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="videoGenerationMode"
                    value="local"
                    checked={videoGenerationMode === 'local'}
                    onChange={() => setVideoGenerationMode('local')}
                  />
                  <span className="video-mode-option-title">Local</span>
                  <span className="video-mode-option-copy">
                    Generate scene videos on this machine with Wan image-to-video.
                  </span>
                </label>
                <label
                  className={`video-mode-option ${videoGenerationMode === 'professional' ? 'is-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="videoGenerationMode"
                    value="professional"
                    checked={videoGenerationMode === 'professional'}
                    onChange={() => setVideoGenerationMode('professional')}
                  />
                  <span className="video-mode-option-title">Professional</span>
                  <span className="video-mode-option-copy">
                    Use Kling, Veo, or Runway externally, then upload each scene MP4.
                  </span>
                </label>
              </div>
            </fieldset>

            {!introCompact ? (
              <div className="topic-chips" aria-label="Suggested topics">
                <span className="chips-label">Suggested:</span>
                {EXAMPLE_TOPICS.map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="chip"
                    disabled={loading || effectiveReviewStep !== null}
                    onClick={() => startWithTopic(example)}
                  >
                    {example}
                  </button>
                ))}
              </div>
            ) : null}

            {error && !failedStep ? <p className="error-banner">{error}</p> : null}
          </section>

          <KnowledgePanel
            selectedSourceId={knowledgeSourceId}
            onSelectSource={setKnowledgeSourceId}
            disabled={loading || effectiveReviewStep !== null}
          />
        </div>
      </div>

      <div ref={resultsRef} id="pipeline-results" className="pipeline-workspace">
        {failedStep && !loading && !effectiveReviewStep ? (
          <StepResumeBar
            stepLabel={getStepLabel(failedStep)}
            stepNumber={getStepNumber(failedStep)}
            error={error ?? 'Something went wrong.'}
            progressLabel={resumeProgressLabel}
            onResume={resumeFailedStep}
            onRestartStep={restartFailedStep}
          />
        ) : null}

        {effectiveReviewStep && !loading ? (
          <StepGateBar
            stepLabel={reviewStepLabel ?? effectiveReviewStep}
            stepNumber={getStepNumber(effectiveReviewStep)}
            isLastStep={getNextStep(effectiveReviewStep) === 'complete'}
            description={
              effectiveReviewStep === 'visual'
                ? 'Choose screen orientation and animation style. These values are applied when generating image and video prompts.'
                : hasMoreVideosToGenerate
                ? `Scene ${countUpscaledScenes(videoScenes)} of ${orderedImageScenes.length} is ready at 1080p. Review below, regenerate if needed, then continue.`
                : isProfessionalMode &&
                    effectiveReviewStep === 'videos' &&
                    pendingProfessionalUploadScene
                  ? `Upload scene ${pendingProfessionalUploadScene.sceneNumber} of ${orderedImageScenes.length}. It will be upscaled to 1080p automatically.`
                  : undefined
            }
            regenerateLabel={
              effectiveReviewStep === 'visual'
                ? undefined
                : hasMoreVideosToGenerate
                  ? 'Regenerate scene'
                  : undefined
            }
            approveLabel={
              effectiveReviewStep === 'visual'
                ? 'Generate prompts'
                : hasMoreVideosToGenerate
                ? `Generate scene ${countUpscaledScenes(videoScenes) + 1} of ${orderedImageScenes.length}`
                : effectiveReviewStep === 'videos'
                  ? 'Approve videos & continue'
                  : undefined
            }
            hideRegenerate={effectiveReviewStep === 'visual'}
            onApprove={approveAndContinue}
            onRegenerate={regenerateCurrentStep}
          />
        ) : null}

        {hasResults && canCreateVideoVariant ? (
          <div className="story-reuse-toolbar">
            <p className="muted">
              Reuse this idea, story, script, and prompts to produce another video
              with different orientation or animation style.
            </p>
            <button
              type="button"
              className="secondary-button"
              disabled={loading || switchingProject}
              onClick={() => void createVideoVariant()}
            >
              New video version
            </button>
          </div>
        ) : null}

        {hasResults ? (
          <div className="results-toolbar">
            <p className="muted">Review each step below. Expand a panel to read the full output.</p>
            <div className="results-toolbar-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={expandAllSteps}
              >
                Expand all
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={collapseAllSteps}
              >
                Collapse all
              </button>
            </div>
          </div>
        ) : null}

        <div className="results">
        {idea ? (
          <StepPanel
            step={1}
            title="Idea"
            expanded={expandedSteps[1]}
            onToggle={() => toggleStep(1)}
            status={getStepStatus('idea', effectiveReviewStep, generatingStep, approvedThroughIndex)}
          >
            <p>{idea}</p>
          </StepPanel>
        ) : null}

        {story ? (
          <StepPanel
            step={2}
            title="Story"
            expanded={expandedSteps[2]}
            onToggle={() => toggleStep(2)}
            status={getStepStatus('story', effectiveReviewStep, generatingStep, approvedThroughIndex)}
          >
            <p className="story-copy">{story}</p>
          </StepPanel>
        ) : null}

        {scriptScenes.length > 0 ? (
          <StepPanel
            step={3}
            title="Script"
            expanded={expandedSteps[3]}
            onToggle={() => toggleStep(3)}
            summary={`${scriptScenes.length} scene${scriptScenes.length === 1 ? '' : 's'}`}
            status={getStepStatus('script', effectiveReviewStep, generatingStep, approvedThroughIndex)}
          >
            <SceneList scenes={scriptScenes} characters={characters} showPrompts={false} />
          </StepPanel>
        ) : null}

        {characters.length > 0 || currentStep === 'character' ? (
          <StepPanel
            step={4}
            title="Character consistency"
            expanded={expandedSteps[4]}
            onToggle={() => toggleStep(4)}
            summary={
              characters.length > 0
                ? `${characters.length} character${characters.length === 1 ? '' : 's'} defined`
                : 'Defining characters'
            }
            status={getStepStatus('character', effectiveReviewStep, generatingStep, approvedThroughIndex)}
          >
            {characters.length > 0 ? (
              <div className="character-profile-grid">
                {reusedCharacterNames.length > 0 ? (
                  <p className="muted character-series-note">
                    Reused from series library: {reusedCharacterNames.join(', ')}
                  </p>
                ) : null}
                {characters.map((character) => (
                  <article key={character.id} className="character-profile">
                    {character.referenceImagePath ? (
                      <img
                        className="character-portrait"
                        src={character.referenceImagePath}
                        alt={`Reference portrait for ${character.name}`}
                      />
                    ) : null}
                    <strong>
                      {character.name}
                      <span className="character-role">{character.role}</span>
                      {reusedCharacterNames.includes(character.name) ? (
                        <span className="character-role">series</span>
                      ) : null}
                    </strong>
                    <p>{character.appearance}</p>
                    <p className="muted character-voice">Voice: {character.voice}</p>
                  </article>
                ))}
                {castReferenceImagePath ? (
                  <article className="character-profile cast-reference-sheet">
                    <img
                      className="character-portrait cast-sheet-image"
                      src={castReferenceImagePath}
                      alt="Cast reference sheet for scene generation"
                    />
                    <strong>Cast reference sheet</strong>
                    <p className="muted">
                      Full-body lineup built from approved portraits (same face and outfit, extended downward).
                    </p>
                  </article>
                ) : null}
              </div>
            ) : (
              <p className="muted">
                Defining characters and generating reference portraits...
              </p>
            )}
          </StepPanel>
        ) : null}

        {characters.length > 0 || currentStep === 'visual' ? (
          <StepPanel
            step={5}
            title="Visual settings"
            expanded={expandedSteps[5]}
            onToggle={() => toggleStep(5)}
            summary={`${getOrientationLabel(visualStyle.orientation)} · ${getAnimationStyleLabel(visualStyle.animationStyle)}`}
            status={getStepStatus('visual', effectiveReviewStep, generatingStep, approvedThroughIndex)}
          >
            {sourceProjectId ? (
              <p className="muted character-series-note">
                This video reuses story content from another project. Pick a new
                look below, then generate prompts and images.
              </p>
            ) : null}
            <VisualSettingsFieldsets
              visualStyle={visualStyle}
              onChange={setVisualStyle}
              disabled={
                loading ||
                (promptedScenes.length > 0 && effectiveReviewStep !== 'visual')
              }
            />
            {canCreateVideoVariant && effectiveReviewStep !== 'visual' ? (
              <div className="visual-settings-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={loading || switchingProject}
                  onClick={() => void createVideoVariant()}
                >
                  New video version from this story
                </button>
              </div>
            ) : null}
          </StepPanel>
        ) : null}

        {promptedScenes.length > 0 || currentStep === 'prompts' ? (
          <StepPanel
            step={6}
            title="Video prompts"
            expanded={expandedSteps[6]}
            onToggle={() => toggleStep(6)}
            summary={
              promptedScenes.length > 0
                ? `${promptedScenes.length} prompt${promptedScenes.length === 1 ? '' : 's'} ready`
                : 'Waiting for prompts'
            }
            status={getStepStatus('prompts', effectiveReviewStep, generatingStep, approvedThroughIndex)}
          >
            {promptedScenes.length > 0 ? (
              <SceneList
                scenes={promptedScenes}
                characters={characters}
                showPrompts
                onRegeneratePrompt={
                  effectiveReviewStep === 'prompts'
                    ? regenerateScenePrompt
                    : undefined
                }
                regeneratingSceneIndex={regeneratingSceneIndex}
              />
            ) : (
              <p className="muted">
                Creating image and video prompts using your visual settings...
              </p>
            )}
          </StepPanel>
        ) : null}

        {imageScenes.length > 0 || currentStep === 'images' ? (
          <StepPanel
            step={7}
            title="Generated images"
            expanded={expandedSteps[7]}
            onToggle={() => toggleStep(7)}
            summary={
              imageScenes.length > 0
                ? `${imageScenes.length} image${imageScenes.length === 1 ? '' : 's'} saved locally`
                : 'Generating images'
            }
            status={getStepStatus('images', effectiveReviewStep, generatingStep, approvedThroughIndex)}
          >
            {imageScenes.length > 0 ? (
              <SceneMediaGallery
                scenes={imageScenes}
                mode="images"
                onRegenerate={
                  effectiveReviewStep === 'images'
                    ? regenerateSceneImage
                    : undefined
                }
                regeneratingSceneIndex={regeneratingSceneIndex}
              />
            ) : (
              <p className="muted">Generating scene images with FLUX.1-dev...</p>
            )}
          </StepPanel>
        ) : null}

        {videoScenes.length > 0 || currentStep === 'videos' ? (
          <StepPanel
            step={8}
            title={
              isProfessionalMode
                ? 'Scene videos (1080p)'
                : 'Scene videos (1080p)'
            }
            expanded={expandedSteps[8]}
            onToggle={() => toggleStep(8)}
            summary={
              countUpscaledScenes(videoScenes) > 0
                ? `${countUpscaledScenes(videoScenes)} of ${imageScenes.length || videoScenes.length} scene${countUpscaledScenes(videoScenes) === 1 ? '' : 's'} at 1920×1080`
                : isProfessionalMode
                  ? 'Upload and upscale'
                  : 'Generating and upscaling'
            }
            status={getStepStatus('videos', effectiveReviewStep, generatingStep, approvedThroughIndex)}
          >
            {isProfessionalMode &&
            effectiveReviewStep === 'videos' &&
            pendingProfessionalUploadScene ? (
              <ProfessionalSceneUpload
                scene={pendingProfessionalUploadScene}
                promptScene={
                  promptedScenes.find(
                    (entry) =>
                      entry.sceneNumber ===
                      pendingProfessionalUploadScene.sceneNumber,
                  ) ?? pendingProfessionalUploadScene
                }
                onUpload={(file) =>
                  void uploadProfessionalSceneVideo(
                    nextProfessionalUploadIndex,
                    file,
                  )
                }
                uploading={
                  regeneratingSceneIndex === nextProfessionalUploadIndex
                }
              />
            ) : null}
            {countUpscaledScenes(videoScenes) > 0 ? (
              <SceneMediaGallery
                scenes={videoScenes.filter((scene) => scene.upscaledVideoPath)}
                mode="upscaled"
                onRegenerate={
                  effectiveReviewStep === 'videos'
                    ? regenerateSceneVideo
                    : undefined
                }
                regeneratingSceneIndex={regeneratingSceneIndex}
              />
            ) : isProfessionalMode ? (
              <p className="muted">
                Generate each clip externally using the scene image and video
                prompt, then upload the MP4 here. Each upload is upscaled to
                1080p automatically.
              </p>
            ) : (
              <p className="muted">
                Generating each scene with Wan2.1 I2V, then upscaling to
                1920×1080...
              </p>
            )}
          </StepPanel>
        ) : null}

        {audioScenes.length > 0 || currentStep === 'audio' ? (
          <StepPanel
            step={9}
            title="Narration audio"
            expanded={expandedSteps[9]}
            onToggle={() => toggleStep(9)}
            summary={
              audioScenes.length > 0
                ? `${audioScenes.length} audio track${audioScenes.length === 1 ? '' : 's'} saved locally`
                : 'Generating narration audio'
            }
            status={getStepStatus('audio', effectiveReviewStep, generatingStep, approvedThroughIndex)}
          >
            {audioScenes.length > 0 ? (
              <SceneAudioGallery
                scenes={audioScenes}
                characters={characters}
                onRegenerate={
                  effectiveReviewStep === 'audio'
                    ? regenerateSceneAudio
                    : undefined
                }
                regeneratingSceneIndex={regeneratingSceneIndex}
              />
            ) : (
              <SceneAudioLoadingState
                sceneIndex={sceneProgressIndex}
                totalScenes={videoScenes.length}
              />
            )}
          </StepPanel>
        ) : null}

        {finalVideoPath || currentStep === 'assembly' ? (
          <StepPanel
            step={10}
            title="Final video"
            expanded={expandedSteps[10]}
            onToggle={() => toggleStep(10)}
            summary={
              finalVideoPath
                ? 'Final story video with synced dialogue audio'
                : 'Assembling final video'
            }
            status={getStepStatus('assembly', effectiveReviewStep, generatingStep, approvedThroughIndex)}
          >
            {finalVideoPath ? (
              <div className="final-video-wrap">
                <video
                  src={finalVideoPath}
                  controls
                  playsInline
                  preload="metadata"
                  className="final-video"
                />
                <p className="muted">
                  <a href={finalVideoPath} download>
                    Download final video
                  </a>
                </p>
              </div>
            ) : (
              <p className="muted">
                Joining scene clips and syncing dialogue audio...
              </p>
            )}
          </StepPanel>
        ) : null}
      </div>

      {currentStep === 'complete' && !loading && !effectiveReviewStep ? (
        <div className="complete-message">
          <p>Pipeline complete for "{topic}".</p>
          {canCreateVideoVariant ? (
            <button
              type="button"
              className="secondary-button"
              disabled={switchingProject}
              onClick={() => void createVideoVariant()}
            >
              Create another video from this story
            </button>
          ) : null}
          {finalVideoPath ? (
            <>
              <div className="final-video-wrap">
                <video
                  src={finalVideoPath}
                  controls
                  playsInline
                  preload="metadata"
                  className="final-video"
                />
              </div>
              <p className="muted">
                <a href={finalVideoPath} download>
                  Download final video
                </a>
              </p>
            </>
          ) : null}
        </div>
      ) : null}
      </div>
    </div>
    </div>
  );
}

type StepStatus = 'pending' | 'generating' | 'review' | 'approved';

function getStepStatus(
  step: PipelineStep,
  reviewStep: PipelineStep | null,
  generatingStep: PipelineStep | null,
  approvedThroughIndex: number,
): StepStatus {
  if (generatingStep === step) {
    return 'generating';
  }
  if (reviewStep === step) {
    return 'review';
  }

  const stepIndex = STEP_ORDER.indexOf(step);
  if (stepIndex <= approvedThroughIndex) {
    return 'approved';
  }

  return 'pending';
}

function VisualSettingsFieldsets({
  visualStyle,
  onChange,
  disabled = false,
}: {
  visualStyle: SeriesVisualStyle;
  onChange: (value: SeriesVisualStyle) => void;
  disabled?: boolean;
}) {
  return (
    <div className="visual-settings-panel">
      <fieldset className="video-mode-selector" disabled={disabled}>
        <legend>Screen orientation</legend>
        <div className="video-mode-options">
          <label
            className={`video-mode-option ${visualStyle.orientation === 'landscape' ? 'is-selected' : ''}`}
          >
            <input
              type="radio"
              name="screenOrientation"
              value="landscape"
              checked={visualStyle.orientation === 'landscape'}
              disabled={disabled}
              onChange={() =>
                onChange(
                  mergeVisualStyle({
                    ...visualStyle,
                    orientation: 'landscape',
                  }),
                )
              }
            />
            <span className="video-mode-option-title">Landscape</span>
            <span className="video-mode-option-copy">
              Horizontal 16:9 framing for YouTube and widescreen feeds.
            </span>
          </label>
          <label
            className={`video-mode-option ${visualStyle.orientation === 'portrait' ? 'is-selected' : ''}`}
          >
            <input
              type="radio"
              name="screenOrientation"
              value="portrait"
              checked={visualStyle.orientation === 'portrait'}
              disabled={disabled}
              onChange={() =>
                onChange(
                  mergeVisualStyle({
                    ...visualStyle,
                    orientation: 'portrait',
                  }),
                )
              }
            />
            <span className="video-mode-option-title">Portrait</span>
            <span className="video-mode-option-copy">
              Vertical 9:16 framing for Shorts, Reels, and TikTok.
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset className="video-mode-selector" disabled={disabled}>
        <legend>Animation style</legend>
        <div className="video-mode-options">
          <label
            className={`video-mode-option ${visualStyle.animationStyle === '2d' ? 'is-selected' : ''}`}
          >
            <input
              type="radio"
              name="animationStyle"
              value="2d"
              checked={visualStyle.animationStyle === '2d'}
              disabled={disabled}
              onChange={() =>
                onChange(
                  mergeVisualStyle({
                    ...visualStyle,
                    animationStyle: '2d',
                  }),
                )
              }
            />
            <span className="video-mode-option-title">2D animated</span>
            <span className="video-mode-option-copy">
              Flat cel-shaded illustration with clean line art and bold colors.
            </span>
          </label>
          <label
            className={`video-mode-option ${visualStyle.animationStyle === '3d' ? 'is-selected' : ''}`}
          >
            <input
              type="radio"
              name="animationStyle"
              value="3d"
              checked={visualStyle.animationStyle === '3d'}
              disabled={disabled}
              onChange={() =>
                onChange(
                  mergeVisualStyle({
                    ...visualStyle,
                    animationStyle: '3d',
                  }),
                )
              }
            />
            <span className="video-mode-option-title">3D animated</span>
            <span className="video-mode-option-copy">
              Stylized CGI cartoon rendering with depth and soft lighting.
            </span>
          </label>
        </div>
      </fieldset>
    </div>
  );
}

function StepResumeBar({
  stepLabel,
  stepNumber,
  error,
  progressLabel,
  onResume,
  onRestartStep,
}: {
  stepLabel: string;
  stepNumber: number;
  error: string;
  progressLabel: string | null;
  onResume: () => void;
  onRestartStep: () => void;
}) {
  return (
    <section className="panel step-resume-bar" aria-label="Resume pipeline step">
      <div className="step-resume-content">
        <div>
          <p className="step-resume-eyebrow">Step {String(stepNumber).padStart(2, '0')} failed</p>
          <h2 className="step-resume-title">Resume {stepLabel}</h2>
          <p className="error-banner step-resume-error">{error}</p>
          <p className="muted">
            Your earlier progress is saved.
            {progressLabel ? ` ${progressLabel}.` : ' '} Resume to continue from
            where it stopped, or restart only this step.
          </p>
        </div>
        <div className="step-resume-actions">
          <button type="button" className="secondary-button" onClick={onRestartStep}>
            Restart step
          </button>
          <button type="button" className="primary-button" onClick={onResume}>
            Resume step
          </button>
        </div>
      </div>
    </section>
  );
}

function StepGateBar({
  stepLabel,
  stepNumber,
  isLastStep,
  description,
  regenerateLabel,
  approveLabel,
  hideRegenerate = false,
  onApprove,
  onRegenerate,
}: {
  stepLabel: string;
  stepNumber: number;
  isLastStep: boolean;
  description?: string;
  regenerateLabel?: string;
  approveLabel?: string;
  hideRegenerate?: boolean;
  onApprove: () => void;
  onRegenerate: () => void;
}) {
  return (
    <section className="panel step-gate-bar" aria-label="Step review actions">
      <div className="step-gate-content">
        <div>
          <p className="step-gate-eyebrow">Review step {String(stepNumber).padStart(2, '0')}</p>
          <h2 className="step-gate-title">{stepLabel}</h2>
          <p className="muted">
            {description ??
              'Check the output below. Regenerate if needed, or continue to the next step.'}
          </p>
        </div>
        <div className="step-gate-actions">
          {hideRegenerate ? null : (
            <button type="button" className="secondary-button" onClick={onRegenerate}>
              {regenerateLabel ?? 'Regenerate'}
            </button>
          )}
          <button type="button" className="primary-button" onClick={onApprove}>
            {approveLabel ??
              (isLastStep ? 'Finish pipeline' : 'Approve & continue')}
          </button>
        </div>
      </div>
    </section>
  );
}

function LoadingOverlay({
  currentStep,
  sceneProgressIndex,
  totalScenes,
}: {
  currentStep: PipelineStep;
  sceneProgressIndex: number;
  totalScenes: number;
}) {
  const activeStepIndex = STEPS.findIndex((step) => step.id === currentStep);
  const isSceneStep =
    currentStep === 'prompts' ||
    currentStep === 'visual' ||
    currentStep === 'images' ||
    currentStep === 'videos' ||
    currentStep === 'audio';
  const scenePercent =
    isSceneStep && totalScenes > 0
      ? Math.round(((sceneProgressIndex + 1) / totalScenes) * 100)
      : 0;

  return (
    <div className="loading-overlay" role="alertdialog" aria-modal="true">
      <div className="loading-overlay-card panel">
        <div className="loading-overlay-header">
          <div className="loader" aria-hidden="true" />
          <p className="loading-overlay-title">Generating</p>
          <p className="loading-overlay-message">
            {getLoadingMessage(currentStep, sceneProgressIndex, totalScenes)}
          </p>
          <p className="loading-overlay-step-count">
            Step {Math.max(activeStepIndex + 1, 1)} of {STEPS.length}
            {isSceneStep && totalScenes > 0
              ? ` · Scene ${sceneProgressIndex + 1} of ${totalScenes}`
              : null}
          </p>
          {isSceneStep && totalScenes > 0 ? (
            <div
              className="loading-scene-progress"
              role="progressbar"
              aria-valuenow={scenePercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Scene progress: ${scenePercent}%`}
            >
              <div
                className="loading-scene-progress-fill"
                style={{ width: `${scenePercent}%` }}
              />
            </div>
          ) : null}
        </div>

        <ol className="loading-overlay-steps">
          {STEPS.map((step, index) => {
            const isComplete = activeStepIndex > index;
            const isActive = step.id === currentStep;
            const isPending = !isComplete && !isActive;
            const hiddenPending = isPending && index > activeStepIndex + 1;

            if (hiddenPending) {
              return null;
            }

            return (
              <li
                key={step.id}
                className={`loading-overlay-step ${isComplete ? 'complete' : ''} ${isActive ? 'active' : ''} ${isPending ? 'pending' : ''}`}
                aria-current={isActive ? 'step' : undefined}
              >
                <span className="loading-overlay-step-marker" aria-hidden="true">
                  {isComplete ? '✓' : index + 1}
                </span>
                <span className="loading-overlay-step-label">{step.label}</span>
                {isActive ? (
                  <span className="loading-overlay-step-badge">In progress</span>
                ) : null}
              </li>
            );
          })}
          {activeStepIndex + 2 < STEPS.length ? (
            <li className="loading-overlay-step loading-overlay-step-more" aria-hidden="true">
              {STEPS.length - activeStepIndex - 2} more step
              {STEPS.length - activeStepIndex - 2 === 1 ? '' : 's'} after this
            </li>
          ) : null}
        </ol>
      </div>
    </div>
  );
}

function getLoadingMessage(
  step: PipelineStep,
  sceneProgressIndex: number,
  totalScenes: number,
) {
  switch (step) {
    case 'idea':
      return 'Generating idea from your topic with Qwen3-14B Q4_K_M...';
    case 'story':
      return 'Writing story from the idea...';
    case 'script':
      return 'Converting story into scenes...';
    case 'character':
      return 'Defining characters and generating reference portraits with FLUX...';
    case 'prompts':
      return `Creating video prompt for scene ${sceneProgressIndex + 1} of ${totalScenes}...`;
    case 'images':
      return `Generating image for scene ${sceneProgressIndex + 1} of ${totalScenes} with FLUX.1-dev...`;
    case 'videos':
      return `Generating and upscaling scene ${sceneProgressIndex + 1} of ${totalScenes} to 1080p...`;
    case 'audio':
      return `Generating dialogue audio for scene ${sceneProgressIndex + 1} of ${totalScenes}...`;
    case 'assembly':
      return 'Assembling final video with synced dialogue audio...';
    default:
      return 'Working...';
  }
}

function StepPanel({
  step,
  title,
  children,
  expanded,
  onToggle,
  summary,
  status,
}: {
  step: number;
  title: string;
  children: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  summary?: string;
  status?: StepStatus;
}) {
  const panelId = `step-panel-${step}`;
  const contentId = `step-panel-content-${step}`;

  return (
    <section
      className={`panel result-panel step-panel ${status === 'review' ? 'is-review' : ''}`}
    >
      <button
        type="button"
        className="panel-toggle"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={contentId}
        id={panelId}
      >
        <div className="panel-heading">
          <span className="step-badge">{String(step).padStart(2, '0')}</span>
          <div className="panel-title-group">
            <h2>{title}</h2>
            {summary && !expanded ? (
              <span className="panel-summary">{summary}</span>
            ) : null}
          </div>
          {status === 'review' ? (
            <span className="step-status-badge review">Awaiting review</span>
          ) : null}
          {status === 'approved' ? (
            <span className="step-status-badge approved">Approved</span>
          ) : null}
        </div>
        <span className="panel-chevron" aria-hidden="true">
          {expanded ? '−' : '+'}
        </span>
      </button>

      {expanded ? (
        <div className="panel-content" id={contentId} role="region" aria-labelledby={panelId}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

function sortScenesByNumber(scenes: SceneScript[]): SceneScript[] {
  return [...scenes].sort((left, right) => left.sceneNumber - right.sceneNumber);
}

function formatAudioDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00';
  }
  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

function formatDialogueTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

function SceneAudioLoadingState({
  sceneIndex,
  totalScenes,
}: {
  sceneIndex: number;
  totalScenes: number;
}) {
  const progress =
    totalScenes > 0
      ? Math.min(100, Math.round(((sceneIndex + 1) / totalScenes) * 100))
      : 0;

  return (
    <div className="scene-audio-loading" aria-live="polite">
      <div className="scene-audio-loading-visual" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="scene-audio-loading-copy">
        <p className="scene-audio-loading-title">Synthesizing character voices</p>
        <p className="muted">
          {totalScenes > 0
            ? `Scene ${Math.min(sceneIndex + 1, totalScenes)} of ${totalScenes}`
            : 'Preparing scene scripts...'}
        </p>
        {totalScenes > 0 ? (
          <div
            className="scene-audio-loading-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SceneAudioGallery({
  scenes,
  characters,
  onRegenerate,
  regeneratingSceneIndex,
}: {
  scenes: SceneScript[];
  characters: StoryCharacter[];
  onRegenerate?: (index: number) => void;
  regeneratingSceneIndex?: number | null;
}) {
  const orderedScenes = sortScenesByNumber(scenes);

  return (
    <div className="scene-audio-gallery">
      <p className="scene-audio-intro muted">
        Listen to each scene&apos;s character voices. Lines are spoken in order with
        distinct voices and timed segments.
      </p>
      {orderedScenes.map((scene) => {
        const index = scenes.findIndex(
          (entry) => entry.sceneNumber === scene.sceneNumber,
        );
        const isRegenerating = regeneratingSceneIndex === index;

        return (
          <SceneAudioCard
            key={scene.sceneNumber}
            scene={scene}
            characters={characters}
            isRegenerating={isRegenerating}
            onRegenerate={
              onRegenerate ? () => onRegenerate(index) : undefined
            }
          />
        );
      })}
    </div>
  );
}

function SceneAudioCard({
  scene,
  characters,
  isRegenerating,
  onRegenerate,
}: {
  scene: SceneScript;
  characters: StoryCharacter[];
  isRegenerating: boolean;
  onRegenerate?: () => void;
}) {
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);

  return (
    <article
      className={`scene-audio-card${isRegenerating ? ' is-regenerating' : ''}`}
    >
      <div className="scene-audio-card-header">
        <div className="scene-audio-card-heading">
          <span className="scene-audio-scene-badge">
            Scene {scene.sceneNumber}
          </span>
          {scene.duration ? (
            <span className="scene-audio-target-duration">
              {scene.duration}s clip
            </span>
          ) : null}
          {durationSeconds ? (
            <span className="scene-audio-track-duration">
              {formatAudioDuration(durationSeconds)} audio
            </span>
          ) : null}
        </div>
        {onRegenerate ? (
          <button
            type="button"
            className="scene-regenerate-button"
            disabled={isRegenerating}
            onClick={onRegenerate}
          >
            {isRegenerating ? 'Regenerating...' : 'Regenerate voice'}
          </button>
        ) : null}
      </div>

      <div className="scene-audio-card-body">
        {scene.imagePath ? (
          <img
            src={scene.imagePath}
            alt=""
            className="scene-audio-thumb"
            loading="lazy"
          />
        ) : (
          <div className="scene-audio-thumb scene-audio-thumb-fallback" aria-hidden>
            <span>{scene.sceneNumber}</span>
          </div>
        )}

        <div className="scene-audio-content">
          <div className="scene-audio-narration">
            <span className="scene-audio-narration-label">Character voices</span>
            {scene.dialogueSegments && scene.dialogueSegments.length > 0 ? (
              <ul className="scene-dialogue-list">
                {scene.dialogueSegments.map((segment, lineIndex) => (
                  <li key={`${scene.sceneNumber}-segment-${lineIndex}`}>
                    <span className="scene-dialogue-time">
                      {formatDialogueTimestamp(segment.start)}–
                      {formatDialogueTimestamp(segment.end)}
                    </span>{' '}
                    <span className="scene-dialogue-speaker">
                      {segment.speaker}:
                    </span>{' '}
                    {segment.text}
                  </li>
                ))}
              </ul>
            ) : getSceneDialogue(scene).length > 0 ? (
              <ul className="scene-dialogue-list">
                {getSceneDialogue(scene).map((line, lineIndex) => (
                  <li key={`${scene.sceneNumber}-audio-${lineIndex}`}>
                    <span className="scene-dialogue-speaker">
                      {line.speaker ??
                        characters.find((entry) => entry.id === line.characterId)
                          ?.name ??
                        line.characterId}
                      :
                    </span>{' '}
                    {line.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{formatSceneDialogue(scene, characters)}</p>
            )}
          </div>

          {scene.audioPath ? (
            <div className="scene-audio-player-shell">
              <div className="scene-audio-waveform" aria-hidden="true">
                {Array.from({ length: 28 }).map((_, barIndex) => (
                  <span
                    key={barIndex}
                    style={{ height: `${28 + ((barIndex * 17) % 52)}%` }}
                  />
                ))}
              </div>
              <audio
                src={scene.audioPath}
                controls
                preload="metadata"
                className="scene-audio-player"
                onLoadedMetadata={(event) => {
                  const target = event.currentTarget;
                  if (Number.isFinite(target.duration)) {
                    setDurationSeconds(target.duration);
                  }
                }}
              />
            </div>
          ) : (
            <p className="muted scene-audio-missing">Audio track unavailable.</p>
          )}
        </div>
      </div>
    </article>
  );
}

function SceneMediaGallery({
  scenes,
  mode,
  onRegenerate,
  regeneratingSceneIndex,
}: {
  scenes: SceneScript[];
  mode: 'images' | 'videos' | 'upscaled';
  onRegenerate?: (index: number) => void;
  regeneratingSceneIndex?: number | null;
}) {
  const orderedScenes = sortScenesByNumber(scenes);

  return (
    <div className="scene-media-gallery" aria-label={`Scene ${mode}`}>
      {orderedScenes.map((scene) => {
        const index = scenes.findIndex(
          (entry) => entry.sceneNumber === scene.sceneNumber,
        );
        const isRegenerating = regeneratingSceneIndex === index;
        const videoSrc =
          mode === 'upscaled' ? scene.upscaledVideoPath : scene.videoPath;

        return (
          <figure key={scene.sceneNumber} className="scene-media-item">
            {mode === 'images' && scene.imagePath ? (
              <img
                src={scene.imagePath}
                alt={`Scene ${scene.sceneNumber}`}
                className="scene-media-thumb"
                loading="lazy"
              />
            ) : null}
            {(mode === 'videos' || mode === 'upscaled') && videoSrc ? (
              <video
                src={videoSrc}
                poster={scene.imagePath}
                controls
                playsInline
                preload="metadata"
                className="scene-media-thumb scene-media-video"
              />
            ) : null}
            <figcaption className="scene-media-caption">
              Scene {scene.sceneNumber}
            </figcaption>
            {onRegenerate ? (
              <button
                type="button"
                className="scene-media-regenerate"
                disabled={isRegenerating}
                onClick={() => onRegenerate(index)}
              >
                {isRegenerating ? '…' : 'Redo'}
              </button>
            ) : null}
          </figure>
        );
      })}
    </div>
  );
}

function ProfessionalSceneUpload({
  scene,
  promptScene,
  onUpload,
  uploading,
}: {
  scene: SceneScript;
  promptScene: SceneScript;
  onUpload: (file: File) => void;
  uploading: boolean;
}) {
  return (
    <div className="professional-upload panel">
      <div className="professional-upload-header">
        <strong>Scene {scene.sceneNumber} upload</strong>
        <span className="muted">{scene.duration}s clip</span>
      </div>
      {scene.imagePath ? (
        <div className="scene-image-wrap">
          <img
            src={scene.imagePath}
            alt={`Reference image for scene ${scene.sceneNumber}`}
            className="scene-image"
          />
        </div>
      ) : null}
      {promptScene.videoPrompt ? (
        <div className="scene-field highlight">
          <div className="prompt-copy-row">
            <strong>External video prompt</strong>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                void navigator.clipboard.writeText(promptScene.videoPrompt ?? '');
              }}
            >
              Copy prompt
            </button>
          </div>
          <p>{promptScene.videoPrompt}</p>
          <p className="muted">
            Use this prompt with the scene image in Kling AI, Google Veo, or
            Runway, then upload the exported MP4 below.
          </p>
        </div>
      ) : null}
      <label className="professional-upload-label">
        <span>Upload scene video (MP4, WebM, or MOV)</span>
        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/*"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onUpload(file);
              event.target.value = '';
            }
          }}
        />
      </label>
      {uploading ? <p className="muted">Uploading video...</p> : null}
    </div>
  );
}

function SceneList({
  scenes,
  characters = [],
  showPrompts,
  showImages = false,
  showVideos = false,
  onRegeneratePrompt,
  onRegenerateImage,
  onRegenerateVideo,
  regeneratingSceneIndex,
}: {
  scenes: SceneScript[];
  characters?: StoryCharacter[];
  showPrompts: boolean;
  showImages?: boolean;
  showVideos?: boolean;
  onRegeneratePrompt?: (index: number) => void;
  onRegenerateImage?: (index: number) => void;
  onRegenerateVideo?: (index: number) => void;
  regeneratingSceneIndex?: number | null;
}) {
  return (
    <div className="scene-grid">
      {scenes.map((scene, index) => (
        <article key={scene.sceneNumber} className="scene-card">
          <div className="scene-card-header">
            <h3>Scene {scene.sceneNumber}</h3>
            <div className="scene-card-actions">
              {onRegeneratePrompt ? (
                <button
                  type="button"
                  className="scene-regenerate-button"
                  disabled={regeneratingSceneIndex === index}
                  onClick={() => onRegeneratePrompt(index)}
                >
                  {regeneratingSceneIndex === index
                    ? 'Regenerating...'
                    : 'Regenerate prompt'}
                </button>
              ) : null}
              {onRegenerateImage ? (
                <button
                  type="button"
                  className="scene-regenerate-button"
                  disabled={regeneratingSceneIndex === index}
                  onClick={() => onRegenerateImage(index)}
                >
                  {regeneratingSceneIndex === index
                    ? 'Regenerating...'
                    : 'Regenerate image'}
                </button>
              ) : null}
              {onRegenerateVideo ? (
                <button
                  type="button"
                  className="scene-regenerate-button"
                  disabled={regeneratingSceneIndex === index}
                  onClick={() => onRegenerateVideo(index)}
                >
                  {regeneratingSceneIndex === index
                    ? 'Regenerating...'
                    : 'Regenerate video'}
                </button>
              ) : null}
              <span>{scene.duration}s</span>
            </div>
          </div>
          {showImages && scene.imagePath ? (
            <div className="scene-image-wrap">
              <img
                src={scene.imagePath}
                alt={`Generated image for scene ${scene.sceneNumber}`}
                className="scene-image"
              />
            </div>
          ) : null}
          {showVideos && scene.videoPath ? (
            <div className="scene-video-wrap">
              <video
                src={scene.videoPath}
                controls
                playsInline
                className="scene-video"
              />
            </div>
          ) : null}
          <div className="scene-field">
            <strong>Dialogue</strong>
            {getSceneDialogue(scene).length > 0 ? (
              <ul className="scene-dialogue-list">
                {getSceneDialogue(scene).map((line, lineIndex) => (
                  <li key={`${scene.sceneNumber}-${lineIndex}`}>
                    <span className="scene-dialogue-speaker">
                      {line.speaker ??
                        characters.find((entry) => entry.id === line.characterId)
                          ?.name ??
                        line.characterId}
                      :
                    </span>{' '}
                    {line.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{scene.narration}</p>
            )}
          </div>
          <div className="scene-field">
            <strong>Visual</strong>
            <p>{scene.visualDescription}</p>
          </div>
          {showPrompts && scene.videoPrompt ? (
            <div className="scene-field highlight">
              <strong>Video prompt</strong>
              <p>{scene.videoPrompt}</p>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
