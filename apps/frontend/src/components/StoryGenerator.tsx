import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  generateCharacterProfile,
  generateIdea,
  generatePrompt,
  generateScript,
  generateStory,
} from '../api/generate';
import type { PipelineStep, SceneScript } from '../types/content';

const EXAMPLE_TOPICS = [
  'Time Traveler',
  'Lost in the Metaverse',
  'The Last Lighthouse Keeper',
];

const STEPS: { id: PipelineStep; label: string }[] = [
  { id: 'idea', label: 'Idea' },
  { id: 'story', label: 'Story' },
  { id: 'script', label: 'Script' },
  { id: 'character', label: 'Character' },
  { id: 'prompts', label: 'Video prompts' },
];

const STEP_DELAY_MS = 1200;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function StoryGenerator() {
  const [topic, setTopic] = useState('');
  const [currentStep, setCurrentStep] = useState<PipelineStep>('topic');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [idea, setIdea] = useState<string | null>(null);
  const [story, setStory] = useState<string | null>(null);
  const [scriptScenes, setScriptScenes] = useState<SceneScript[]>([]);
  const [promptedScenes, setPromptedScenes] = useState<SceneScript[]>([]);
  const [characterAppearance, setCharacterAppearance] = useState<string | null>(
    null,
  );
  const [promptSceneIndex, setPromptSceneIndex] = useState(0);
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({
    1: false,
    2: false,
    3: false,
    4: false,
    5: false,
  });

  const pipelineStarted = currentStep !== 'topic';
  const [introVisible, setIntroVisible] = useState(true);

  useEffect(() => {
    if (!loading) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [loading]);

  useEffect(() => {
    let lastScrollY = window.scrollY;

    function onScroll() {
      const currentScrollY = window.scrollY;

      if (currentScrollY <= 48) {
        setIntroVisible(true);
      } else if (currentScrollY > lastScrollY && currentScrollY > 140) {
        setIntroVisible(false);
      }

      lastScrollY = currentScrollY;
    }

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  function showIntro() {
    setIntroVisible(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetPipeline() {
    setCurrentStep('topic');
    setLoading(false);
    setError(null);
    setIdea(null);
    setStory(null);
    setScriptScenes([]);
    setPromptedScenes([]);
    setCharacterAppearance(null);
    setPromptSceneIndex(0);
    setTopic('');
    setExpandedSteps({ 1: false, 2: false, 3: false, 4: false, 5: false });
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
    setExpandedSteps({ 1: true, 2: true, 3: true, 4: true, 5: true });
  }

  function collapseAllSteps() {
    setExpandedSteps({ 1: false, 2: false, 3: false, 4: false, 5: false });
  }

  function revealStep(step: number) {
    setExpandedSteps((current) => ({
      ...current,
      [step]: true,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTopic = topic.trim();
    if (!trimmedTopic) {
      setError('Please enter a topic.');
      return;
    }

    setError(null);
    setIdea(null);
    setStory(null);
    setScriptScenes([]);
    setPromptedScenes([]);
    setCharacterAppearance(null);
    setPromptSceneIndex(0);
    setExpandedSteps({ 1: false, 2: false, 3: false, 4: false, 5: false });
    setLoading(true);

    try {
      setCurrentStep('idea');
      const ideaResponse = await generateIdea({ topic: trimmedTopic });
      setIdea(ideaResponse.idea);
      revealStep(1);
      setLoading(false);
      await wait(STEP_DELAY_MS);

      setLoading(true);
      setCurrentStep('story');
      const storyResponse = await generateStory({ idea: ideaResponse.idea });
      setStory(storyResponse.story);
      revealStep(2);
      setLoading(false);
      await wait(STEP_DELAY_MS);

      setLoading(true);
      setCurrentStep('script');
      const scriptResponse = await generateScript({ story: storyResponse.story });
      setScriptScenes(scriptResponse.script);
      revealStep(3);
      setLoading(false);
      await wait(STEP_DELAY_MS);

      setLoading(true);
      setCurrentStep('character');
      revealStep(4);

      const profileResponse = await generateCharacterProfile({
        story: storyResponse.story,
        script: scriptResponse.script,
      });
      setCharacterAppearance(profileResponse.characterAppearance);
      setLoading(false);
      await wait(STEP_DELAY_MS);

      setLoading(true);
      setCurrentStep('prompts');
      revealStep(5);

      const scenesWithPrompts: SceneScript[] = [];

      for (const [index, scene] of scriptResponse.script.entries()) {
        setPromptSceneIndex(index);
        const promptResponse = await generatePrompt({
          scene,
          characterAppearance: profileResponse.characterAppearance,
        });
        scenesWithPrompts.push(promptResponse.scene);
        setPromptedScenes([...scenesWithPrompts]);
      }

      setCurrentStep('complete');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Something went wrong. Try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  const activeStepIndex = STEPS.findIndex((step) => step.id === currentStep);
  const hasResults =
    idea ||
    story ||
    scriptScenes.length > 0 ||
    characterAppearance ||
    promptedScenes.length > 0;

  return (
    <div className="app-shell">
      {loading ? (
        <LoadingOverlay
          currentStep={currentStep}
          promptSceneIndex={promptSceneIndex}
          totalScenes={scriptScenes.length}
          activeStepIndex={activeStepIndex}
        />
      ) : null}

      <div className={`page-intro ${introVisible ? '' : 'is-hidden'}`}>
        <div className="page-intro-inner">
          <header className="hero">
            <p className="eyebrow">AI Story Factory</p>
            <h1>Step-by-step story pipeline</h1>
            <p className="subtitle">
              Pick a topic, then expand each step to review idea, story, script,
              and video prompts without scrolling through everything at once.
            </p>
          </header>

          <section className="panel generator-panel topic-panel">
            <div className="topic-panel-header">
              <div>
                <h2>Choose a topic</h2>
                <p className="muted">
                  Start a new story anytime. Suggested topics are one click away.
                </p>
              </div>
              {pipelineStarted ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={resetPipeline}
                  disabled={loading}
                >
                  New topic
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
                  disabled={loading}
                />
                <button type="submit" disabled={loading}>
                  {loading
                    ? 'Running...'
                    : pipelineStarted
                      ? 'Restart'
                      : 'Start pipeline'}
                </button>
              </div>
            </form>

            <div className="topic-chips" aria-label="Suggested topics">
              <span className="chips-label">Suggested:</span>
              {EXAMPLE_TOPICS.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="chip"
                  disabled={loading}
                  onClick={() => startWithTopic(example)}
                >
                  {example}
                </button>
              ))}
            </div>

            {error ? <p className="error-banner">{error}</p> : null}
          </section>
        </div>
      </div>

      {!introVisible && !loading ? (
        <button
          type="button"
          className="intro-return-button"
          onClick={showIntro}
        >
          Show topic & headline
        </button>
      ) : null}

      {hasResults ? (
        <div className="results-toolbar">
          <p className="muted">Expand a step to view its content.</p>
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
          >
            <SceneList scenes={scriptScenes} showPrompts={false} />
          </StepPanel>
        ) : null}

        {characterAppearance || currentStep === 'character' ? (
          <StepPanel
            step={4}
            title="Character consistency"
            expanded={expandedSteps[4]}
            onToggle={() => toggleStep(4)}
            summary={characterAppearance ? 'Uniform look defined' : 'Defining character'}
          >
            {characterAppearance ? (
              <div className="character-profile">
                <strong>Uniform character appearance</strong>
                <p>{characterAppearance}</p>
              </div>
            ) : (
              <p className="muted">Defining uniform character from story and script...</p>
            )}
          </StepPanel>
        ) : null}

        {promptedScenes.length > 0 || currentStep === 'prompts' ? (
          <StepPanel
            step={5}
            title="Video prompts"
            expanded={expandedSteps[5]}
            onToggle={() => toggleStep(5)}
            summary={
              promptedScenes.length > 0
                ? `${promptedScenes.length} prompt${promptedScenes.length === 1 ? '' : 's'} ready`
                : 'Waiting for prompts'
            }
          >
            {promptedScenes.length > 0 ? (
              <SceneList scenes={promptedScenes} showPrompts />
            ) : (
              <p className="muted">Creating video prompts with consistent character...</p>
            )}
          </StepPanel>
        ) : null}
      </div>

      {currentStep === 'complete' && !loading ? (
        <p className="complete-message">Pipeline complete for "{topic}".</p>
      ) : null}
    </div>
  );
}

function LoadingOverlay({
  currentStep,
  promptSceneIndex,
  totalScenes,
  activeStepIndex,
}: {
  currentStep: PipelineStep;
  promptSceneIndex: number;
  totalScenes: number;
  activeStepIndex: number;
}) {
  return (
    <div className="loading-overlay" role="alertdialog" aria-modal="true">
      <div className="loading-overlay-card panel">
        <div className="loader" aria-hidden="true" />
        <p className="loading-overlay-title">Pipeline running</p>
        <p className="loading-overlay-message">
          {getLoadingMessage(currentStep, promptSceneIndex, totalScenes)}
        </p>

        <ul className="loading-overlay-steps">
          {STEPS.map((step, index) => {
            const isComplete =
              activeStepIndex > index || currentStep === 'complete';
            const isActive = step.id === currentStep;

            return (
              <li
                key={step.id}
                className={`loading-overlay-step ${isComplete ? 'complete' : ''} ${isActive ? 'active' : ''}`}
              >
                <span className="stepper-dot">{index + 1}</span>
                <span>{step.label}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function getLoadingMessage(
  step: PipelineStep,
  promptSceneIndex: number,
  totalScenes: number,
) {
  switch (step) {
    case 'idea':
      return 'Generating idea from your topic...';
    case 'story':
      return 'Writing story from the idea...';
    case 'script':
      return 'Converting story into scenes...';
    case 'character':
      return 'Defining uniform character from story and script...';
    case 'prompts':
      return `Creating video prompt for scene ${promptSceneIndex + 1} of ${totalScenes}...`;
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
}: {
  step: number;
  title: string;
  children: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  summary?: string;
}) {
  const panelId = `step-panel-${step}`;
  const contentId = `step-panel-content-${step}`;

  return (
    <section className="panel result-panel step-panel">
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

function SceneList({
  scenes,
  showPrompts,
}: {
  scenes: SceneScript[];
  showPrompts: boolean;
}) {
  return (
    <div className="scene-grid">
      {scenes.map((scene) => (
        <article key={scene.sceneNumber} className="scene-card">
          <div className="scene-card-header">
            <h3>Scene {scene.sceneNumber}</h3>
            <span>{scene.duration}s</span>
          </div>
          <div className="scene-field">
            <strong>Narration</strong>
            <p>{scene.narration}</p>
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
