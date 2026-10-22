import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ConfigNoticeProps {
  onRecheck: () => void;
  isChecking: boolean;
}

/**
 * Blocking pre-flight state: the proxy answered, but it has no provider keys.
 * Better to say that before the first message than after it fails.
 */
export const ConfigNotice: React.FC<ConfigNoticeProps> = ({ onRecheck, isChecking }) => {
  return (
    <div className="config-notice" role="alert">
      <div className="config-notice-head">
        <AlertTriangle size={16} aria-hidden="true" />
        <span className="hud-text">NO PROVIDER KEYS</span>
      </div>

      <p>
        The proxy at <code>/api/chat</code> is running, but <code>GEMINI_API_KEY</code> and{' '}
        <code>OPENROUTER_API_KEY</code> are both missing from this environment. Chat stays disabled until one of
        them is set.
      </p>

      <ol>
        <li>
          Vercel: Project → Settings → Environment Variables → add <code>GEMINI_API_KEY</code> (or{' '}
          <code>OPENROUTER_API_KEY</code>), scope Production, then redeploy.
        </li>
        <li>
          Local: put the same name in <code>.env.local</code> at the project root and restart <code>npm run dev</code>.
        </li>
      </ol>

      <p className="config-notice-foot">
        Keys are read server-side only; they are never sent to the browser.
      </p>

      <button type="button" className="neon-btn" onClick={onRecheck} disabled={isChecking}>
        <RefreshCw size={13} aria-hidden="true" />
        <span>{isChecking ? 'Checking…' : 'Recheck'}</span>
      </button>
    </div>
  );
};
