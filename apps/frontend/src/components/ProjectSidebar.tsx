import type { SaveStatus } from '../types/project';
import { getStepLabel, type ProjectSummary } from '../types/project';
import type { SeriesSummary } from '../types/series';
import { formatProjectTimestamp } from '../utils/pipeline-state';

interface ProjectSidebarProps {
  seriesList: SeriesSummary[];
  activeSeriesId: string | null;
  activeSeriesName: string;
  projects: ProjectSummary[];
  activeProjectId: string | null;
  activeProjectName: string;
  saveStatus: SaveStatus;
  loadingSeries: boolean;
  loadingProjects: boolean;
  switchingProject: boolean;
  onSelectSeries: (seriesId: string | null) => void;
  onCreateSeries: () => void;
  onRenameSeries: (name: string) => void;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onDeleteProject: (projectId: string) => void;
  onRenameProject: (name: string) => void;
}

export function ProjectSidebar({
  seriesList,
  activeSeriesId,
  activeSeriesName,
  projects,
  activeProjectId,
  activeProjectName,
  saveStatus,
  loadingSeries,
  loadingProjects,
  switchingProject,
  onSelectSeries,
  onCreateSeries,
  onRenameSeries,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  onRenameProject,
}: ProjectSidebarProps) {
  const visibleProjects = activeSeriesId
    ? projects.filter((project) => project.seriesId === activeSeriesId)
    : projects;

  return (
    <aside className="project-sidebar panel">
      <div className="project-sidebar-header">
        <div>
          <p className="project-sidebar-eyebrow">Series</p>
          <h2>Shared universe</h2>
        </div>
        <button
          type="button"
          className="primary-button project-new-button"
          onClick={onCreateSeries}
          disabled={switchingProject}
        >
          New series
        </button>
      </div>

      <label className="project-name-field" htmlFor="series-name">
        Series name
      </label>
      <input
        id="series-name"
        className="project-name-input"
        value={activeSeriesName}
        onChange={(event) => onRenameSeries(event.target.value)}
        disabled={!activeSeriesId || switchingProject}
        placeholder="Select or create a series"
      />

      <div className="series-list" aria-label="Saved series">
        {loadingSeries ? (
          <p className="muted project-list-empty">Loading series...</p>
        ) : (
          <>
            <button
              type="button"
              className={`series-filter-button ${activeSeriesId === null ? 'active' : ''}`}
              onClick={() => onSelectSeries(null)}
              disabled={switchingProject}
            >
              All projects
            </button>
            {seriesList.map((series) => (
              <button
                key={series.id}
                type="button"
                className={`series-filter-button ${activeSeriesId === series.id ? 'active' : ''}`}
                onClick={() => onSelectSeries(series.id)}
                disabled={switchingProject}
              >
                <span className="project-select-name">{series.name}</span>
                <span className="project-select-meta">
                  {series.characterCount} character
                  {series.characterCount === 1 ? '' : 's'} · {series.projectCount ?? 0}{' '}
                  video{series.projectCount === 1 ? '' : 's'}
                </span>
              </button>
            ))}
          </>
        )}
      </div>

      <div className="project-sidebar-header project-sidebar-header-spaced">
        <div>
          <p className="project-sidebar-eyebrow">Videos</p>
          <h2>Saved work</h2>
        </div>
        <button
          type="button"
          className="primary-button project-new-button"
          onClick={onCreateProject}
          disabled={switchingProject}
        >
          New video
        </button>
      </div>

      <label className="project-name-field" htmlFor="project-name">
        Video name
      </label>
      <input
        id="project-name"
        className="project-name-input"
        value={activeProjectName}
        onChange={(event) => onRenameProject(event.target.value)}
        disabled={!activeProjectId || switchingProject}
        placeholder="Untitled project"
      />

      <p className={`project-save-status status-${saveStatus}`}>
        {getSaveStatusLabel(saveStatus)}
      </p>

      <div className="project-list" aria-label="Saved projects">
        {loadingProjects ? (
          <p className="muted project-list-empty">Loading projects...</p>
        ) : visibleProjects.length === 0 ? (
          <p className="muted project-list-empty">
            {activeSeriesId
              ? 'Create a video in this series to keep characters and visual style consistent.'
              : 'Create a project to save your pipeline progress locally.'}
          </p>
        ) : (
          visibleProjects.map((project) => {
            const isActive = project.id === activeProjectId;

            return (
              <div
                key={project.id}
                className={`project-list-item ${isActive ? 'active' : ''}`}
              >
                <button
                  type="button"
                  className="project-select-button"
                  onClick={() => onSelectProject(project.id)}
                  disabled={switchingProject || isActive}
                >
                  <span className="project-select-name">{project.name}</span>
                  <span className="project-select-meta">
                    {project.topic || 'No topic yet'} ·{' '}
                    {getStepLabel(project.currentStep)}
                  </span>
                  <span className="project-select-time">
                    {formatProjectTimestamp(project.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  className="project-delete-button"
                  aria-label={`Delete ${project.name}`}
                  onClick={() => onDeleteProject(project.id)}
                  disabled={switchingProject}
                >
                  Delete
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

function getSaveStatusLabel(status: SaveStatus): string {
  switch (status) {
    case 'saving':
      return 'Saving...';
    case 'saved':
      return 'All changes saved';
    case 'error':
      return 'Save failed';
    default:
      return 'Ready';
  }
}
