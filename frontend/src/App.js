import { useState } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL ||
  `${window.location.protocol}//${window.location.hostname}:5000`;

const modes = [
  {
    id: 'text',
    label: 'Text',
    description: 'Paste articles, notes, transcripts, or raw research.',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    description: 'Turn a YouTube transcript into a focused recap.',
  },
  {
    id: 'pdf',
    label: 'PDF',
    description: 'Upload a PDF and extract the key ideas in seconds.',
  },
];

const lengthOptions = ['short', 'medium', 'detailed'];
const toneOptions = ['clear', 'bullet points', 'executive'];

const emptyHistory = [];

function App() {
  const [mode, setMode] = useState('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState(null);
  const [summaryLength, setSummaryLength] = useState('medium');
  const [tone, setTone] = useState('clear');
  const [summary, setSummary] = useState('');
  const [highlights, setHighlights] = useState(emptyHistory);
  const [sourceMeta, setSourceMeta] = useState(null);
  const [history, setHistory] = useState(emptyHistory);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const resetOutput = () => {
    setSummary('');
    setHighlights(emptyHistory);
    setSourceMeta(null);
    setError('');
  };

  const buildPayload = () => ({
    length: summaryLength,
    tone,
  });

  const submitSummary = async (event) => {
    event.preventDefault();
    resetOutput();
    setIsLoading(true);

    try {
      let response;

      if (mode === 'text') {
        response = await axios.post(`${API_BASE_URL}/summarize/text`, {
          text,
          ...buildPayload(),
        });
      } else if (mode === 'youtube') {
        response = await axios.post(`${API_BASE_URL}/summarize/youtube`, {
          url,
          ...buildPayload(),
        });
      } else {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('length', summaryLength);
        formData.append('tone', tone);
        response = await axios.post(`${API_BASE_URL}/summarize/pdf`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
      }

      const data = response.data;
      const nextSummary = data.summary || 'No summary was returned.';
      const nextHighlights = Array.isArray(data.highlights) ? data.highlights : emptyHistory;

      setSummary(nextSummary);
      setHighlights(nextHighlights);
      setSourceMeta(data.source || null);
      setHistory((currentHistory) => [
        {
          id: Date.now(),
          title: data.source?.label || mode.toUpperCase(),
          excerpt: nextSummary.replace(/\s+/g, ' ').trim(),
        },
        ...currentHistory.slice(0, 4),
      ]);
    } catch (requestError) {
      const message =
        requestError.response?.data?.error ||
        'The summarizer could not finish this request. Please check the backend and try again.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const currentMode = modes.find((item) => item.id === mode);
  const textCount = text.trim().length;
  const canSubmit =
    !isLoading &&
    ((mode === 'text' && textCount > 80) ||
      (mode === 'youtube' && url.trim()) ||
      (mode === 'pdf' && file));

  return (
    <div className="app-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <main className="app-frame">
        <section className="hero-card">
          <div className="hero-copy">
            <p className="eyebrow">AI Summarizer</p>
            <h1>Condense long content into sharp, useful takeaways.</h1>
            <p className="hero-text">
              Summarize text, PDFs, and YouTube transcripts with a cleaner workflow,
              adjustable tone, and a graceful offline fallback.
            </p>
          </div>

          <div className="hero-stats">
            <div className="stat-card">
              <span className="stat-value">3</span>
              <span className="stat-label">input modes</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">1</span>
              <span className="stat-label">smart summary flow</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">24/7</span>
              <span className="stat-label">ready to review</span>
            </div>
          </div>
        </section>

        <section className="workspace-grid">
          <form className="panel composer-panel" onSubmit={submitSummary}>
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Input</p>
                <h2>{currentMode?.label} summarizer</h2>
              </div>
              <span className="status-pill">{currentMode?.description}</span>
            </div>

            <div className="mode-tabs" role="tablist" aria-label="Input mode">
              {modes.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === mode ? 'mode-tab active' : 'mode-tab'}
                  onClick={() => {
                    setMode(item.id);
                    setText('');
                    setUrl('');
                    setFile(null);
                    setError('');
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {mode === 'text' && (
              <label className="field">
                <span>Paste source text</span>
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Paste a report, article, meeting notes, or transcript..."
                  rows={12}
                />
                <small>{textCount} characters</small>
              </label>
            )}

            {mode === 'youtube' && (
              <label className="field">
                <span>YouTube URL</span>
                <input
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                />
                <small>Best with videos that have transcripts available.</small>
              </label>
            )}

            {mode === 'pdf' && (
              <label className="field upload-field">
                <span>Upload PDF</span>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                />
                <small>{file ? file.name : 'Choose a PDF document to summarize.'}</small>
              </label>
            )}

            <div className="controls-grid">
              <label className="field">
                <span>Summary length</span>
                <select
                  value={summaryLength}
                  onChange={(event) => setSummaryLength(event.target.value)}
                >
                  {lengthOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Output style</span>
                <select value={tone} onChange={(event) => setTone(event.target.value)}>
                  {toneOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button className="primary-button" type="submit" disabled={!canSubmit}>
              {isLoading ? 'Summarizing...' : 'Generate summary'}
            </button>

            {error && <p className="error-banner">{error}</p>}
          </form>

          <section className="panel results-panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Output</p>
                <h2>Summary workspace</h2>
              </div>
              <span className="status-pill subtle">
                {sourceMeta?.engine || 'Awaiting request'}
              </span>
            </div>

            {summary ? (
              <div className="summary-stack">
                {sourceMeta && (
                  <div className="meta-row">
                    <div>
                      <span className="meta-label">Source</span>
                      <strong>{sourceMeta.label}</strong>
                    </div>
                    <div>
                      <span className="meta-label">Mode</span>
                      <strong>{sourceMeta.mode}</strong>
                    </div>
                  </div>
                )}

                <article className="summary-card">
                  <h3>Summary</h3>
                  <p>{summary}</p>
                </article>

                <article className="summary-card">
                  <h3>Highlights</h3>
                  {highlights.length ? (
                    <ul className="highlights-list">
                      {highlights.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No highlight bullets were returned for this request.</p>
                  )}
                </article>
              </div>
            ) : (
              <div className="empty-state">
                <h3>Ready when you are</h3>
                <p>
                  Pick a source, tune the style, and generate a summary built for quick
                  reading and fast decision-making.
                </p>
              </div>
            )}
          </section>
        </section>

        <section className="bottom-grid">
          <section className="panel history-panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Recent</p>
                <h2>Summary snapshots</h2>
              </div>
            </div>

            {history.length ? (
              <div className="history-list">
                {history.map((item) => (
                  <article className="history-card" key={item.id}>
                    <strong>{item.title}</strong>
                    <p>{item.excerpt}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted-copy">Your last few summaries will appear here.</p>
            )}
          </section>

          <section className="panel tips-panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Guide</p>
                <h2>Best results</h2>
              </div>
            </div>
            <div className="tips-list">
              <div>
                <strong>Use medium or detailed for research-heavy text.</strong>
                <p>Longer outputs preserve nuance better for reports and transcripts.</p>
              </div>
              <div>
                <strong>Executive mode is best for stakeholder-ready takeaways.</strong>
                <p>It pushes the result toward concise, decision-focused language.</p>
              </div>
              <div>
                <strong>The backend can still summarize without an API key.</strong>
                <p>A local fallback keeps the app functional for demos and development.</p>
              </div>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}

export default App;
