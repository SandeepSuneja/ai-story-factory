import { useState, type FormEvent } from 'react';
import { generateContent } from '../api/generate';
import type { GenerateContentResponse } from '../types/content';

const EXAMPLE_TOPICS = [
  'Time Traveler',
  'Lost in the Metaverse',
  'The Last Lighthouse Keeper',
];

export function StoryGenerator() {
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateContentResponse | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTopic = topic.trim();
    if (!trimmedTopic) {
      setError('Please enter a topic.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await generateContent({ topic: trimmedTopic });
      setResult(response);
    } catch (err) {
      setResult(null);
      setError(
        err instanceof Error ? err.message : 'Something went wrong. Try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <p className="eyebrow">AI Story Factory</p>
        <h1>Turn a topic into a short-video story pipeline</h1>
        <p className="subtitle">
          Generate an idea, full story, scene script, and cinematic video prompts
          from a single topic.
        </p>
      </header>

      <section className="panel generator-panel">
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
              {loading ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </form>

        <div className="topic-chips" aria-label="Example topics">
          {EXAMPLE_TOPICS.map((example) => (
            <button
              key={example}
              type="button"
              className="chip"
              disabled={loading}
              onClick={() => setTopic(example)}
            >
              {example}
            </button>
          ))}
        </div>

        {error ? <p className="error-banner">{error}</p> : null}
      </section>

      {loading ? (
        <section className="panel status-panel">
          <div className="loader" aria-hidden="true" />
          <p>Running idea, story, script, and prompt agents...</p>
          <p className="muted">This can take a minute depending on the model.</p>
        </section>
      ) : null}

      {result ? (
        <div className="results">
          <section className="panel result-panel">
            <div className="panel-heading">
              <span className="step-badge">01</span>
              <h2>Idea</h2>
            </div>
            <p>{result.idea}</p>
          </section>

          <section className="panel result-panel">
            <div className="panel-heading">
              <span className="step-badge">02</span>
              <h2>Story</h2>
            </div>
            <p className="story-copy">{result.story}</p>
          </section>

          <section className="panel result-panel">
            <div className="panel-heading">
              <span className="step-badge">03</span>
              <h2>Script</h2>
            </div>
            <div className="scene-grid">
              {result.script.map((scene) => (
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
                  {scene.videoPrompt ? (
                    <div className="scene-field highlight">
                      <strong>Video prompt</strong>
                      <p>{scene.videoPrompt}</p>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
