import type { SaveStatus } from '../types/project';
import { getStepLabel, type ProjectSummary } from '../types/project';
import { formatProjectTimestamp } from '../utils/pipeline-state';

interface ProjectSidebarProps {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  activeProjectName: string;
  saveStatus: SaveStatus;
  loadingProjects: boolean;
  switchingProject: boolean;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onDeleteProject: (projectId: string) => void;
  onRenameProject: (name: string) => void;
}

export function ProjectSidebar({
  projects,
  activeProjectId,
  activeProjectName,
  saveStatus,
  loadingProjects,
  switchingProject,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  onRenameProject,
}: ProjectSidebarProps) {
  return (
    <aside className="project-sidebar panel">
      <div className="project-sidebar-header">
        <div>
          <p className="project-sidebar-eyebrow">Projects</p>
          <h2>Saved work</h2>
        </div>
        <button
          type="button"
          className="primary-button project-new-button"
          onClick={onCreateProject}
          disabled={switchingProject}
        >
          New
        </button>
      </div>

      <label className="project-name-field" htmlFor="project-name">
        Project name
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
        ) : projects.length === 0 ? (
          <p className="muted project-list-empty">
            Create a project to save your pipeline progress locally.
          </p>
        ) : (
          projects.map((project) => {
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
