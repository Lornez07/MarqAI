import React from 'react';
import { Plus } from 'lucide-react';
import type { Session } from '../lib/sessions';

interface SessionListProps {
  sessions: Session[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
}

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const SessionList: React.FC<SessionListProps> = ({ sessions, activeId, onSelect, onNew }) => {
  return (
    <section className="hud-panel sessions-panel" aria-label="Chat sessions">
      <div className="sessions-head">
        <span className="hud-text">Sessions</span>
        <button type="button" className="neon-btn sessions-new" onClick={onNew} aria-label="Start a new session">
          <Plus size={12} aria-hidden="true" />
          <span>New</span>
        </button>
      </div>

      <ul className="sessions-list">
        {sessions.map((session) => {
          const active = session.id === activeId;
          return (
            <li key={session.id}>
              <button
                type="button"
                className={`session-item ${active ? 'is-active' : ''}`}
                aria-current={active ? 'true' : undefined}
                onClick={() => onSelect(session.id)}
                title={session.title}
              >
                <span className="session-title">{session.title}</span>
                <span className="session-time">{relativeTime(session.updatedAt)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
