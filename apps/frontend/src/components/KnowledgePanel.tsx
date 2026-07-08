import { useCallback, useEffect, useState, type FormEvent } from 'react';
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
  disabled?: boolean;
}

export function KnowledgePanel({
  selectedSourceId,
  onSelectSource,
  disabled = false,
}: KnowledgePanelProps) {
  const [sources, setSources] = useState<KnowledgeSourceSummary[]>([]);
  const [ragHealthy, setRagHealthy] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceDescription, setNewSourceDescription] = useState('');
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentText, setDocumentText] = useState('');
  const [question, setQuestion] = useState('');
  const [qaResult, setQaResult] = useState<AskKnowledgeResponse | null>(null);

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
      const created = await createKnowledgeSource({
        name,
        description: newSourceDescription.trim(),
      });
      setNewSourceName('');
      setNewSourceDescription('');
      await refreshSources();
      onSelectSource(created.id);
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

  return (
    <section className="panel knowledge-panel">
      <div className="knowledge-panel-header">
        <div>
          <h2>Source knowledge (RAG)</h2>
          <p className="muted">
            Index canonical texts like Ramayana, then enable source fidelity so
            idea, story, script, and prompts stay faithful to the uploaded source.
          </p>
        </div>
        <span
          className={`knowledge-health ${ragHealthy ? 'is-healthy' : 'is-degraded'}`}
        >
          RAG {ragHealthy ? 'online' : ragHealthy === false ? 'offline' : '…'}
        </span>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <form className="knowledge-form" onSubmit={handleCreateSource}>
        <h3>Create source</h3>
        <label htmlFor="source-name">Name</label>
        <input
          id="source-name"
          value={newSourceName}
          onChange={(event) => setNewSourceName(event.target.value)}
          placeholder="e.g. Ramayana (Valmiki)"
          disabled={disabled || loading}
        />
        <label htmlFor="source-description">Description</label>
        <input
          id="source-description"
          value={newSourceDescription}
          onChange={(event) => setNewSourceDescription(event.target.value)}
          placeholder="Optional notes"
          disabled={disabled || loading}
        />
        <button type="submit" disabled={disabled || loading}>
          Create source
        </button>
      </form>

      <div className="knowledge-source-list">
        <h3>Sources</h3>
        {sources.length === 0 ? (
          <p className="muted">No sources yet. Create one and add text files.</p>
        ) : (
          <ul>
            {sources.map((source) => (
              <li key={source.id}>
                <label className="knowledge-source-item">
                  <input
                    type="radio"
                    name="knowledgeSource"
                    checked={selectedSourceId === source.id}
                    onChange={() => onSelectSource(source.id)}
                    disabled={disabled || loading}
                  />
                  <span>
                    <strong>{source.name}</strong>
                    <span className="muted">
                      {source.documentCount} docs · {source.chunkCount} chunks
                    </span>
                    {source.description ? (
                      <span className="muted">{source.description}</span>
                    ) : null}
                  </span>
                </label>
                <button
                  type="button"
                  className="text-button"
                  disabled={disabled || loading}
                  onClick={() => void handleDeleteSource(source.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form className="knowledge-form" onSubmit={handleAddDocument}>
        <h3>Add source text</h3>
        <label htmlFor="document-title">Document title</label>
        <input
          id="document-title"
          value={documentTitle}
          onChange={(event) => setDocumentTitle(event.target.value)}
          placeholder="e.g. Ayodhya Kanda excerpt"
          disabled={disabled || loading || !selectedSourceId}
        />
        <label htmlFor="document-text">Paste text</label>
        <textarea
          id="document-text"
          rows={8}
          value={documentText}
          onChange={(event) => setDocumentText(event.target.value)}
          placeholder="Paste canonical source text here..."
          disabled={disabled || loading || !selectedSourceId}
        />
        <div className="knowledge-form-actions">
          <button type="submit" disabled={disabled || loading || !selectedSourceId}>
            Index text
          </button>
          <label className="secondary-button file-upload-button">
            Upload .txt
            <input
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              disabled={disabled || loading || !selectedSourceId}
              onChange={(event) => void handleUploadFile(event)}
            />
          </label>
        </div>
      </form>

      <form className="knowledge-form" onSubmit={handleAsk}>
        <h3>Test Q&amp;A</h3>
        <label htmlFor="knowledge-question">Question</label>
        <input
          id="knowledge-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="What happens when Rama meets Hanuman?"
          disabled={disabled || loading || !selectedSourceId}
        />
        <button type="submit" disabled={disabled || loading || !selectedSourceId}>
          Ask source
        </button>
      </form>

      {qaResult ? (
        <div className="knowledge-qa-result">
          <h3>Answer</h3>
          <p>{qaResult.answer}</p>
          {qaResult.hits.length > 0 ? (
            <details>
              <summary>Retrieved excerpts ({qaResult.hits.length})</summary>
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
    </section>
  );
}
