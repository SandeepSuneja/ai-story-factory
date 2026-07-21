import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  addKnowledgeDocuments,
  askKnowledgeSource,
  createKnowledgeSource,
  deleteKnowledgeSource,
  getKnowledgeHealth,
  listKnowledgeSources,
  uploadKnowledgeDocument,
} from '../api/knowledge';
import type {
  AskKnowledgeResponse,
  KnowledgeSourceSummary,
} from '../types/knowledge';

interface KnowledgePanelProps {
  selectedSourceId: string | null;
  onSelectSource: (sourceId: string | null) => void;
  sourceFidelityMode: boolean;
  onSourceFidelityModeChange: (enabled: boolean) => void;
  disabled?: boolean;
}

type KnowledgeSection = 'sources' | 'index' | 'qa';

function KnowledgeSegment({
  id,
  title,
  summary,
  expanded,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  summary?: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="knowledge-segment">
      <button
        type="button"
        className="knowledge-segment-toggle"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`${id}-content`}
      >
        <span className="knowledge-segment-title">{title}</span>
        {!expanded && summary ? (
          <span className="knowledge-segment-summary">{summary}</span>
        ) : null}
        <span className="knowledge-segment-chevron" aria-hidden="true">
          {expanded ? '−' : '+'}
        </span>
      </button>
      {expanded ? (
        <div className="knowledge-segment-content" id={`${id}-content`}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function KnowledgePanel({
  selectedSourceId,
  onSelectSource,
  sourceFidelityMode,
  onSourceFidelityModeChange,
  disabled = false,
}: KnowledgePanelProps) {
  const [sources, setSources] = useState<KnowledgeSourceSummary[]>([]);
  const [ragHealthy, setRagHealthy] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [activeSection, setActiveSection] = useState<KnowledgeSection | null>(
    'sources',
  );
  const [newSourceName, setNewSourceName] = useState('');
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentText, setDocumentText] = useState('');
  const [question, setQuestion] = useState('');
  const [qaResult, setQaResult] = useState<AskKnowledgeResponse | null>(null);

  const selectedSource = sources.find((source) => source.id === selectedSourceId);

  const refreshSources = useCallback(async () => {
    const [health, nextSources] = await Promise.all([
      getKnowledgeHealth(),
      listKnowledgeSources(),
    ]);
    setRagHealthy(health.rag);
    setSources(nextSources);
    if (
      selectedSourceId &&
      !nextSources.some((source) => source.id === selectedSourceId)
    ) {
      onSelectSource(null);
    }
  }, [onSelectSource, selectedSourceId]);

  useEffect(() => {
    void refreshSources().catch((err) => {
      setError(
        err instanceof Error ? err.message : 'Failed to load knowledge sources.',
      );
    });
  }, [refreshSources]);

  useEffect(() => {
    if (selectedSourceId || sources.length > 0 || sourceFidelityMode) {
      setExpanded(true);
    }
  }, [selectedSourceId, sources.length, sourceFidelityMode]);

  function toggleSection(section: KnowledgeSection) {
    setActiveSection((current) => (current === section ? null : section));
  }

  async function handleCreateSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newSourceName.trim();
    if (!name) {
      setError('Enter a source name.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const created = await createKnowledgeSource({ name });
      setNewSourceName('');
      await refreshSources();
      onSelectSource(created.id);
      setActiveSection('index');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create knowledge source.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleAddDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSourceId) {
      setError('Select a knowledge source first.');
      return;
    }
    const text = documentText.trim();
    if (!text) {
      setError('Paste source text to index.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await addKnowledgeDocuments(selectedSourceId, {
        documents: [
          {
            title: documentTitle.trim() || undefined,
            text,
          },
        ],
      });
      setDocumentTitle('');
      setDocumentText('');
      await refreshSources();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to index document text.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedSourceId) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await uploadKnowledgeDocument(
        selectedSourceId,
        file,
        documentTitle.trim() || file.name,
      );
      await refreshSources();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to upload source file.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSourceId) {
      setError('Select a knowledge source first.');
      return;
    }
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      setError('Enter a question.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await askKnowledgeSource(selectedSourceId, trimmedQuestion);
      setQaResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to answer question.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteSource(sourceId: string) {
    setLoading(true);
    setError(null);
    try {
      await deleteKnowledgeSource(sourceId);
      if (selectedSourceId === sourceId) {
        onSelectSource(null);
      }
      await refreshSources();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to delete knowledge source.',
      );
    } finally {
      setLoading(false);
    }
  }

  const panelSummary = selectedSource
    ? `${selectedSource.name} · ${selectedSource.chunkCount} chunks${
        sourceFidelityMode ? ' · fidelity on' : ''
      }`
    : sources.length > 0
      ? `${sources.length} source${sources.length === 1 ? '' : 's'} available`
      : 'Optional canonical source indexing';

  return (
    <fieldset
      className="video-mode-selector knowledge-section"
      disabled={disabled}
    >
      <legend className="knowledge-section-legend">Source knowledge (RAG)</legend>

      <div className="knowledge-section-header">
        <button
          type="button"
          className="knowledge-section-toggle"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
        >
          {!expanded ? (
            <span className="knowledge-section-summary">{panelSummary}</span>
          ) : (
            <span className="knowledge-section-summary is-expanded">
              Index canonical texts and optionally lock the pipeline to source
              fidelity.
            </span>
          )}
          <span className="knowledge-section-chevron" aria-hidden="true">
            {expanded ? '−' : '+'}
          </span>
        </button>
        <span
          className={`knowledge-health ${ragHealthy ? 'is-healthy' : 'is-degraded'}`}
        >
          {ragHealthy ? 'Online' : ragHealthy === false ? 'Offline' : '…'}
        </span>
      </div>

      {expanded ? (
        <div className="knowledge-section-body">
          <label className="knowledge-fidelity-toggle">
            <input
              type="checkbox"
              checked={sourceFidelityMode}
              onChange={(event) =>
                onSourceFidelityModeChange(event.target.checked)
              }
              disabled={!selectedSourceId || loading}
            />
            <span>
              Source fidelity — keep idea, story, script, and prompts aligned
              with indexed text
            </span>
          </label>

          {error ? <p className="error-text knowledge-error">{error}</p> : null}

          <KnowledgeSegment
            id="knowledge-sources"
            title="Sources"
            summary={
              selectedSource
                ? selectedSource.name
                : `${sources.length} source${sources.length === 1 ? '' : 's'}`
            }
            expanded={activeSection === 'sources'}
            onToggle={() => toggleSection('sources')}
          >
            {sources.length === 0 ? (
              <p className="muted knowledge-empty">
                No sources yet. Create one below, then index .txt or .md files.
              </p>
            ) : (
              <div className="knowledge-source-grid">
                {sources.map((source) => (
                  <div
                    key={source.id}
                    className={`knowledge-source-card ${
                      selectedSourceId === source.id ? 'is-selected' : ''
                    }`}
                  >
                    <label className="knowledge-source-card-label">
                      <input
                        type="radio"
                        name="knowledgeSource"
                        checked={selectedSourceId === source.id}
                        onChange={() => onSelectSource(source.id)}
                        disabled={loading}
                      />
                      <span className="knowledge-source-card-title">
                        {source.name}
                      </span>
                      <span className="knowledge-source-card-meta">
                        {source.documentCount} docs · {source.chunkCount} chunks
                      </span>
                    </label>
                    <button
                      type="button"
                      className="text-button knowledge-source-delete"
                      disabled={loading}
                      onClick={() => void handleDeleteSource(source.id)}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form className="knowledge-inline-form" onSubmit={handleCreateSource}>
              <input
                value={newSourceName}
                onChange={(event) => setNewSourceName(event.target.value)}
                placeholder="New source name (e.g. Ramayana)"
                disabled={loading}
                aria-label="New source name"
              />
              <button type="submit" className="secondary-button" disabled={loading}>
                Add source
              </button>
            </form>
          </KnowledgeSegment>

          <KnowledgeSegment
            id="knowledge-index"
            title="Index content"
            summary={
              selectedSource
                ? `Add text to ${selectedSource.name}`
                : 'Select a source first'
            }
            expanded={activeSection === 'index'}
            onToggle={() => toggleSection('index')}
          >
            {!selectedSourceId ? (
              <p className="muted knowledge-empty">
                Select or create a source before indexing text.
              </p>
            ) : (
              <form className="knowledge-index-form" onSubmit={handleAddDocument}>
                <input
                  value={documentTitle}
                  onChange={(event) => setDocumentTitle(event.target.value)}
                  placeholder="Document title (optional)"
                  disabled={loading}
                  aria-label="Document title"
                />
                <textarea
                  rows={4}
                  value={documentText}
                  onChange={(event) => setDocumentText(event.target.value)}
                  placeholder="Paste canonical source text or Markdown..."
                  disabled={loading}
                  aria-label="Source text"
                />
                <div className="knowledge-form-actions">
                  <button type="submit" disabled={loading}>
                    Index text
                  </button>
                  <label className="secondary-button file-upload-button">
                    Upload .txt / .md
                    <input
                      type="file"
                      accept=".txt,.md,text/plain,text/markdown"
                      disabled={loading}
                      onChange={(event) => void handleUploadFile(event)}
                    />
                  </label>
                </div>
              </form>
            )}
          </KnowledgeSegment>

          <KnowledgeSegment
            id="knowledge-qa"
            title="Test retrieval"
            summary="Verify Q&A before generating"
            expanded={activeSection === 'qa'}
            onToggle={() => toggleSection('qa')}
          >
            {!selectedSourceId ? (
              <p className="muted knowledge-empty">
                Select a source to test retrieval.
              </p>
            ) : (
              <>
                <form className="knowledge-inline-form" onSubmit={handleAsk}>
                  <input
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="Ask about the indexed source..."
                    disabled={loading}
                    aria-label="Knowledge question"
                  />
                  <button type="submit" className="secondary-button" disabled={loading}>
                    Ask
                  </button>
                </form>
                {qaResult ? (
                  <div className="knowledge-qa-result">
                    <p>{qaResult.answer}</p>
                    {qaResult.hits.length > 0 ? (
                      <details>
                        <summary>
                          Retrieved excerpts ({qaResult.hits.length})
                        </summary>
                        <ul>
                          {qaResult.hits.map((hit) => (
                            <li key={hit.id}>
                              <strong>{hit.documentTitle ?? hit.id}</strong>
                              <p>{hit.text}</p>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </KnowledgeSegment>
        </div>
      ) : null}
    </fieldset>
  );
}
