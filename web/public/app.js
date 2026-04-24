const { useState, useEffect, useRef, useCallback, useMemo } = React;

// ============================================================================
// API client
// ============================================================================

const api = {
  async request(path, opts = {}) {
    const res = await fetch('/api' + path, {
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      let err = { error: `HTTP ${res.status}` };
      try { err = await res.json(); } catch {}
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  },
  get:    (p)      => api.request(p),
  post:   (p, b)   => api.request(p, { method: 'POST', body: b }),
  patch:  (p, b)   => api.request(p, { method: 'PATCH', body: b }),
  put:    (p, b)   => api.request(p, { method: 'PUT', body: b }),
  delete: (p)      => api.request(p, { method: 'DELETE' }),
};

// ============================================================================
// User identity (simple localStorage prompt — v1 has no auth)
// ============================================================================

function useDisplayName() {
  const [name, setName] = useState(() => localStorage.getItem('displayName') || '');
  useEffect(() => {
    if (!name) {
      let input = null;
      while (!input || !input.trim()) {
        input = prompt('Your name (used for annotation attribution):', '');
        if (input === null) break;
      }
      if (input && input.trim()) {
        const v = input.trim();
        localStorage.setItem('displayName', v);
        setName(v);
      }
    }
  }, [name]);
  return name;
}

// ============================================================================
// Router — hash-based, tiny
// ============================================================================

function useRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/');
  useEffect(() => {
    const handler = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  const path = hash.replace(/^#/, '') || '/';
  const parts = path.split('/').filter(Boolean);
  return { path, parts, navigate: (to) => { window.location.hash = to; } };
}

// ============================================================================
// Toast system
// ============================================================================

const ToastContext = React.createContext(null);

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((message, variant = 'info', ms = 3500) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, message, variant }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), ms);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-stack">
        {toasts.map(t => <div key={t.id} className={`toast ${t.variant}`}>{t.message}</div>)}
      </div>
    </ToastContext.Provider>
  );
}
const useToast = () => React.useContext(ToastContext);

// ============================================================================
// Modal
// ============================================================================

function Modal({ onClose, title, children, actions }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <h2>{title}</h2>
        {children}
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  );
}

// ============================================================================
// TopBar
// ============================================================================

function TopBar({ crumbs, displayName }) {
  const { navigate } = useRoute();
  return (
    <div className="topbar">
      <div className="brand">
        <span className="brand-dot"></span>
        <span>UX Research Platform</span>
      </div>
      {crumbs && crumbs.length > 0 && (
        <div className="breadcrumb">
          <span className="crumb-link" onClick={() => navigate('/')}>Projects</span>
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              <span className="sep">/</span>
              {c.onClick ? <span className="crumb-link" onClick={c.onClick}>{c.label}</span> : <span>{c.label}</span>}
            </React.Fragment>
          ))}
        </div>
      )}
      <div className="user">
        <span>👤</span>
        <span className="user-name">{displayName || '…'}</span>
      </div>
    </div>
  );
}

// ============================================================================
// Dashboard — project list
// ============================================================================

function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const toast = useToast();
  const { navigate } = useRoute();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProjects(await api.get('/projects'));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    try {
      const p = await api.post('/projects', { name: form.name.trim(), description: form.description.trim() || undefined });
      setShowCreate(false);
      setForm({ name: '', description: '' });
      navigate(`/projects/${p.id}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="main">
      <div className="page-header">
        <div>
          <div className="page-title">Projects</div>
          <div className="page-sub">Benchmarking engagements you're running or participating in</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New project</button>
      </div>

      {loading ? <div className="empty-state"><div className="spinner"></div></div> :
        projects.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📁</div>
            <p>No projects yet.</p>
            <p className="text-sm" style={{marginTop: 8}}>Create one to start a benchmarking engagement.</p>
          </div>
        ) : (
          <div className="card-grid">
            {projects.map(p => (
              <div key={p.id} className="project-card" onClick={() => navigate(`/projects/${p.id}`)}>
                <h3>{p.name}</h3>
                <p>{p.description || <em>No description</em>}</p>
                <div className="meta">
                  <span>Created {new Date(p.createdAt).toLocaleDateString()}</span>
                  <span>{p.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

      {showCreate && (
        <Modal
          title="New project"
          onClose={() => setShowCreate(false)}
          actions={
            <>
              <button className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate}>Create project</button>
            </>
          }
        >
          <div className="field">
            <label className="field-label">Project name</label>
            <input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. FTA benchmarking" />
          </div>
          <div className="field">
            <label className="field-label">Description (optional)</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What's this benchmark for?" />
          </div>
          <p className="text-sm text-muted">The 11 default research themes will be added to this project. You can edit them anytime.</p>
        </Modal>
      )}
    </div>
  );
}

// ============================================================================
// Project view — tabs for Sites, Themes, Syntheses, Report
// ============================================================================

function ProjectView({ projectId }) {
  const { navigate, parts } = useRoute();
  const subPath = parts[2] || 'sites';
  const [project, setProject] = useState(null);
  const [sites, setSites] = useState([]);
  const [themes, setThemes] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [captures, setCaptures] = useState({}); // siteId -> captures[]
  const toast = useToast();

  const reload = useCallback(async () => {
    try {
      const [p, s, t, a] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/projects/${projectId}/sites`),
        api.get(`/projects/${projectId}/themes`),
        api.get(`/projects/${projectId}/annotations`),
      ]);
      setProject(p);
      setSites(s);
      setThemes(t);
      setAnnotations(a);
      // Load captures for each site
      const capMap = {};
      await Promise.all(s.map(async (site) => {
        capMap[site.id] = await api.get(`/sites/${site.id}/captures`);
      }));
      setCaptures(capMap);
    } catch (err) {
      toast(err.message, 'error');
    }
  }, [projectId, toast]);

  useEffect(() => { reload(); }, [reload]);

  if (!project) return <div className="main"><div className="empty-state"><div className="spinner"></div></div></div>;

  return (
    <div className="main">
      <div className="page-header">
        <div>
          <div className="page-title">{project.name}</div>
          {project.description && <div className="page-sub">{project.description}</div>}
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${subPath === 'sites' ? 'active' : ''}`} onClick={() => navigate(`/projects/${projectId}/sites`)}>
          Sites ({sites.length})
        </button>
        <button className={`tab ${subPath === 'themes' ? 'active' : ''}`} onClick={() => navigate(`/projects/${projectId}/themes`)}>
          Themes ({themes.length})
        </button>
        <button className={`tab ${subPath === 'syntheses' ? 'active' : ''}`} onClick={() => navigate(`/projects/${projectId}/syntheses`)}>
          Synthesise
        </button>
        <button className={`tab ${subPath === 'report' ? 'active' : ''}`} onClick={() => navigate(`/projects/${projectId}/report`)}>
          Report
        </button>
      </div>

      {subPath === 'sites' && (
        <SitesTab
          projectId={projectId}
          sites={sites}
          captures={captures}
          annotations={annotations}
          onChange={reload}
        />
      )}
      {subPath === 'themes' && <ThemesTab projectId={projectId} themes={themes} annotations={annotations} onChange={reload} />}
      {subPath === 'syntheses' && <SynthesesTab projectId={projectId} themes={themes} annotations={annotations} />}
      {subPath === 'report' && <ReportTab projectId={projectId} />}
    </div>
  );
}

// ============================================================================
// Sites tab
// ============================================================================

function SitesTab({ projectId, sites, captures, annotations, onChange }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', sector: '', country: '' });
  const [capturingId, setCapturingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const toast = useToast();
  const { navigate } = useRoute();

  const add = async () => {
    if (!form.name.trim() || !form.url.trim()) return;
    try {
      await api.post(`/projects/${projectId}/sites`, {
        name: form.name.trim(),
        url: form.url.trim(),
        sector: form.sector.trim() || undefined,
        country: form.country.trim() || undefined,
      });
      setShowAdd(false);
      setForm({ name: '', url: '', sector: '', country: '' });
      onChange();
    } catch (err) { toast(err.message, 'error'); }
  };

  const capture = async (siteId) => {
    setCapturingId(siteId);
    toast('Starting capture — this may take up to a minute', 'info');
    try {
      await api.post(`/sites/${siteId}/capture`, { includePerformance: true });
      toast('Capture complete', 'success');
      onChange();
    } catch (err) {
      toast(`Capture failed: ${err.message}`, 'error');
    } finally {
      setCapturingId(null);
    }
  };

  const remove = async (siteId, name) => {
    if (!confirm(`Delete "${name}" and all its captures/annotations?`)) return;
    try {
      await api.delete(`/sites/${siteId}`);
      onChange();
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div>
      <div className="flex-gap mb-16" style={{justifyContent: 'space-between'}}>
        <div className="text-muted text-sm">Add the sites you want to benchmark, then capture them to generate screenshots and performance data.</div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add site</button>
      </div>

      {sites.length === 0 ? (
        <div className="empty-state"><div className="icon">🌐</div>No sites yet. Add one to begin.</div>
      ) : (
        <div>
          {sites.map(site => {
            const siteCaps = captures[site.id] || [];
            const siteAnnotCount = annotations.filter(a => a.siteId === site.id).length;
            const isExpanded = expandedId === site.id;
            return (
              <div key={site.id}>
                <div className="site-row">
                  <div className="site-info" onClick={() => setExpandedId(isExpanded ? null : site.id)} style={{cursor: 'pointer'}}>
                    <div className="site-name">{site.name}</div>
                    <div className="site-url">{site.url}</div>
                  </div>
                  <div className="site-actions">
                    <span className="site-captures">{siteCaps.length} captures · {siteAnnotCount} annotations</span>
                    <button
                      className="btn btn-sm"
                      disabled={capturingId === site.id}
                      onClick={() => capture(site.id)}
                    >
                      {capturingId === site.id ? <><span className="spinner"></span> Capturing…</> : '📸 Capture'}
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setExpandedId(isExpanded ? null : site.id)}>
                      {isExpanded ? '▾' : '▸'}
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(site.id, site.name)}>Delete</button>
                  </div>
                </div>
                {isExpanded && (
                  <div style={{padding: '0 0 20px 20px'}}>
                    {siteCaps.length === 0 ? (
                      <div className="text-sm text-muted" style={{padding: 12}}>No captures yet. Click Capture above to run automated capture.</div>
                    ) : (
                      <div className="capture-grid">
                        {siteCaps.map(c => {
                          const annotCount = annotations.filter(a => a.captureId === c.id).length;
                          return (
                            <div key={c.id} className="capture-card" onClick={() => navigate(`/captures/${c.id}`)}>
                              <div className="capture-thumb" style={{backgroundImage: `url(/screenshots/${c.screenshotPath})`, backgroundPosition: 'top center'}}></div>
                              <div className="capture-body">
                                <div className="capture-state">{c.stateLabel}</div>
                                <div className="capture-title">{c.title || '—'}</div>
                                <div className="capture-annot-count">{annotCount} annotation{annotCount !== 1 ? 's' : ''}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <Modal
          title="Add site"
          onClose={() => setShowAdd(false)}
          actions={<>
            <button className="btn" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={add}>Add site</button>
          </>}
        >
          <div className="field">
            <label className="field-label">Name</label>
            <input autoFocus value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. HMRC — UK" />
          </div>
          <div className="field">
            <label className="field-label">URL</label>
            <input value={form.url} onChange={e => setForm({...form, url: e.target.value})} placeholder="https://www.gov.uk/hmrc" />
          </div>
          <div className="field-row">
            <div className="field">
              <label className="field-label">Sector</label>
              <input value={form.sector} onChange={e => setForm({...form, sector: e.target.value})} placeholder="government" />
            </div>
            <div className="field">
              <label className="field-label">Country</label>
              <input value={form.country} onChange={e => setForm({...form, country: e.target.value})} placeholder="UK" />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================================
// Themes tab
// ============================================================================

function ThemesTab({ projectId, themes, annotations, onChange }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', color: '#7c5cff' });
  const [editing, setEditing] = useState(null);
  const toast = useToast();

  const annotCountByTheme = useMemo(() => {
    const m = {};
    annotations.forEach(a => { m[a.themeId] = (m[a.themeId] || 0) + 1; });
    return m;
  }, [annotations]);

  const add = async () => {
    if (!form.name.trim()) return;
    try {
      await api.post(`/projects/${projectId}/themes`, { name: form.name.trim(), description: form.description.trim() || undefined, color: form.color });
      setShowAdd(false);
      setForm({ name: '', description: '', color: '#7c5cff' });
      onChange();
    } catch (err) { toast(err.message, 'error'); }
  };

  const saveEdit = async () => {
    try {
      await api.patch(`/themes/${editing.id}`, { name: editing.name, description: editing.description, color: editing.color });
      setEditing(null);
      onChange();
    } catch (err) { toast(err.message, 'error'); }
  };

  const remove = async (id, name) => {
    if (!confirm(`Delete theme "${name}"? Annotations tagged to it will also be removed.`)) return;
    try { await api.delete(`/themes/${id}`); onChange(); }
    catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div>
      <div className="flex-gap mb-16" style={{justifyContent: 'space-between'}}>
        <div className="text-muted text-sm">Themes are the analytical lenses for this benchmark. Edit, reorder, or add your own.</div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add theme</button>
      </div>
      {themes.map(t => (
        <div key={t.id} className="theme-item">
          <div className="theme-dot" style={{background: t.color || '#7c5cff'}}></div>
          <div className="theme-info">
            <div className="theme-name">{t.name}</div>
            {t.description && <div className="theme-desc">{t.description}</div>}
          </div>
          <span className="theme-count">{annotCountByTheme[t.id] || 0}</span>
          <button className="btn btn-sm btn-ghost" onClick={() => setEditing({...t})}>Edit</button>
          <button className="btn btn-sm btn-danger" onClick={() => remove(t.id, t.name)}>Delete</button>
        </div>
      ))}

      {showAdd && (
        <Modal
          title="Add theme"
          onClose={() => setShowAdd(false)}
          actions={<>
            <button className="btn" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={add}>Add</button>
          </>}
        >
          <div className="field">
            <label className="field-label">Name</label>
            <input autoFocus value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
          </div>
          <div className="field">
            <label className="field-label">Description</label>
            <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
          </div>
          <div className="field">
            <label className="field-label">Color</label>
            <input type="color" value={form.color} onChange={e => setForm({...form, color: e.target.value})} style={{height: 40}} />
          </div>
        </Modal>
      )}

      {editing && (
        <Modal
          title="Edit theme"
          onClose={() => setEditing(null)}
          actions={<>
            <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveEdit}>Save</button>
          </>}
        >
          <div className="field">
            <label className="field-label">Name</label>
            <input autoFocus value={editing.name} onChange={e => setEditing({...editing, name: e.target.value})} />
          </div>
          <div className="field">
            <label className="field-label">Description</label>
            <textarea value={editing.description || ''} onChange={e => setEditing({...editing, description: e.target.value})} />
          </div>
          <div className="field">
            <label className="field-label">Color</label>
            <input type="color" value={editing.color || '#7c5cff'} onChange={e => setEditing({...editing, color: e.target.value})} style={{height: 40}} />
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================================
// Annotation Workspace — the critical screen
// ============================================================================

function AnnotationWorkspace({ captureId }) {
  const displayName = useDisplayName();
  const { navigate } = useRoute();
  const toast = useToast();

  const [capture, setCapture] = useState(null);
  const [site, setSite] = useState(null);
  const [project, setProject] = useState(null);
  const [themes, setThemes] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [drawingMode, setDrawingMode] = useState(false);
  const [draftRect, setDraftRect] = useState(null); // while dragging
  const [pendingRect, setPendingRect] = useState(null); // after mouseup
  const [form, setForm] = useState({ title: '', commentary: '', themeId: '', sentiment: 'neutral' });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRationale, setAiRationale] = useState('');
  const [saving, setSaving] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const imgRef = useRef(null);

  // Load everything
  useEffect(() => {
    (async () => {
      try {
        const c = await api.get(`/captures/${captureId}`);
        setCapture(c);
        const s = await api.get(`/sites/${c.siteId}`);
        setSite(s);
        const p = await api.get(`/projects/${s.projectId}`);
        setProject(p);
        const [t, a, h] = await Promise.all([
          api.get(`/projects/${p.id}/themes`),
          api.get(`/captures/${captureId}/annotations`),
          api.get('/health'),
        ]);
        setThemes(t);
        setAnnotations(a);
        setAiEnabled(h.aiEnabled);
        if (t.length > 0) setForm(f => ({ ...f, themeId: t[0].id }));
      } catch (err) {
        toast(err.message, 'error');
      }
    })();
  }, [captureId, toast]);

  // When a pending rect is set, switch out of drawing mode and focus form
  useEffect(() => {
    if (pendingRect) setDrawingMode(false);
  }, [pendingRect]);

  // Drawing handlers
  const imgPos = (e) => {
    const rect = imgRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleImgMouseDown = (e) => {
    if (!drawingMode) return;
    const p = imgPos(e);
    setDraftRect({ startX: p.x, startY: p.y, x: p.x, y: p.y, width: 0, height: 0 });
  };

  const handleImgMouseMove = (e) => {
    if (!draftRect) return;
    const p = imgPos(e);
    setDraftRect(prev => ({
      ...prev,
      x: Math.min(prev.startX, p.x),
      y: Math.min(prev.startY, p.y),
      width: Math.abs(p.x - prev.startX),
      height: Math.abs(p.y - prev.startY),
    }));
  };

  const handleImgMouseUp = () => {
    if (!draftRect) return;
    if (draftRect.width < 10 || draftRect.height < 10) {
      setDraftRect(null);
      return;
    }
    setPendingRect({ x: draftRect.x, y: draftRect.y, width: draftRect.width, height: draftRect.height });
    setDraftRect(null);
    setSelectedId(null);
  };

  const selected = useMemo(() => annotations.find(a => a.id === selectedId), [annotations, selectedId]);
  const themeById = useMemo(() => Object.fromEntries(themes.map(t => [t.id, t])), [themes]);

  const resetForm = () => {
    setForm({ title: '', commentary: '', themeId: themes[0]?.id || '', sentiment: 'neutral' });
    setAiRationale('');
  };

  const startEditSelected = (a) => {
    setSelectedId(a.id);
    setPendingRect(null);
    setForm({ title: a.title, commentary: a.commentary, themeId: a.themeId, sentiment: a.sentiment });
    setAiRationale('');
  };

  const cancelDraft = () => {
    setPendingRect(null);
    resetForm();
  };

  const saveAnnotation = async () => {
    if (!form.title.trim()) { toast('Title is required', 'error'); return; }
    if (!form.themeId) { toast('Pick a theme', 'error'); return; }
    setSaving(true);
    try {
      if (selected) {
        // Update existing
        const updated = await api.patch(`/annotations/${selected.id}`, {
          themeId: form.themeId,
          sentiment: form.sentiment,
          title: form.title.trim(),
          commentary: form.commentary.trim(),
        });
        setAnnotations(anns => anns.map(a => a.id === updated.id ? updated : a));
        toast('Annotation updated', 'success');
      } else if (pendingRect) {
        // Create new
        const created = await api.post(`/captures/${captureId}/annotations`, {
          themeId: form.themeId,
          sentiment: form.sentiment,
          rect: pendingRect,
          title: form.title.trim(),
          commentary: form.commentary.trim(),
          createdBy: displayName || 'anonymous',
        });
        setAnnotations(anns => [...anns, created]);
        setPendingRect(null);
        resetForm();
        toast('Annotation added', 'success');
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteSelected = async () => {
    if (!selected) return;
    if (!confirm(`Delete annotation "${selected.title}"?`)) return;
    try {
      await api.delete(`/annotations/${selected.id}`);
      setAnnotations(anns => anns.filter(a => a.id !== selected.id));
      setSelectedId(null);
      resetForm();
    } catch (err) { toast(err.message, 'error'); }
  };

  const suggestTags = async () => {
    if (!form.title.trim() && !form.commentary.trim()) {
      toast('Write something first, then I can suggest a theme', 'info');
      return;
    }
    setAiLoading(true);
    try {
      const suggestion = await api.post('/ai/suggest-tag', {
        projectId: project.id,
        title: form.title,
        commentary: form.commentary,
        siteContext: `${site.name} — ${capture.stateLabel}`,
      });
      setForm(f => ({
        ...f,
        themeId: suggestion.themeId || f.themeId,
        sentiment: suggestion.sentiment || f.sentiment,
      }));
      setAiRationale(suggestion.rationale);
    } catch (err) { toast(err.message, 'error'); }
    finally { setAiLoading(false); }
  };

  if (!capture || !site || !project) return <div className="main"><div className="empty-state"><div className="spinner"></div></div></div>;

  return (
    <>
      <TopBar
        displayName={displayName}
        crumbs={[
          { label: project.name, onClick: () => navigate(`/projects/${project.id}`) },
          { label: site.name, onClick: () => navigate(`/projects/${project.id}/sites`) },
          { label: capture.stateLabel },
        ]}
      />
      <div className="annotation-layout">
        <div className="annotation-canvas-wrap">
          <div
            className={`annotation-canvas ${drawingMode ? 'drawing' : ''}`}
            onMouseDown={handleImgMouseDown}
            onMouseMove={handleImgMouseMove}
            onMouseUp={handleImgMouseUp}
            onMouseLeave={() => setDraftRect(null)}
          >
            <img ref={imgRef} src={`/screenshots/${capture.screenshotPath}`} alt={capture.stateLabel} draggable={false} />

            {annotations.map((a, i) => {
              const theme = themeById[a.themeId];
              const color = theme?.color || '#7c5cff';
              return (
                <div
                  key={a.id}
                  className={`rect ${a.id === selectedId ? 'active' : ''}`}
                  style={{
                    left: a.rect.x, top: a.rect.y, width: a.rect.width, height: a.rect.height,
                    borderColor: color,
                    background: `${color}18`,
                  }}
                  onClick={(e) => { e.stopPropagation(); startEditSelected(a); }}
                  title={`${a.title} — ${theme?.name || 'Unknown theme'}`}
                >
                  <div className="pin" style={{ borderColor: color, color }}>{i + 1}</div>
                </div>
              );
            })}

            {pendingRect && (
              <div
                className="rect active"
                style={{
                  left: pendingRect.x, top: pendingRect.y, width: pendingRect.width, height: pendingRect.height,
                  borderColor: 'var(--accent)', background: 'rgba(124,92,255,0.15)',
                }}
              >
                <div className="pin" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>+</div>
              </div>
            )}

            {draftRect && (
              <div
                className="drawing-rect"
                style={{ left: draftRect.x, top: draftRect.y, width: draftRect.width, height: draftRect.height }}
              />
            )}
          </div>
        </div>

        <div className="annotation-panel">
          <div className="panel-section">
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
              <h3 style={{margin: 0}}>{selected ? 'Edit annotation' : pendingRect ? 'New annotation' : 'Annotations'}</h3>
              {!drawingMode && !pendingRect && !selected && (
                <button className="btn btn-primary btn-sm" onClick={() => { setDrawingMode(true); resetForm(); }}>+ New</button>
              )}
            </div>

            {drawingMode && (
              <div className="panel-help">
                Click and drag on the screenshot to draw a region. Release to fill in details.
                <div style={{marginTop: 6}}>
                  <button className="btn btn-sm btn-ghost" onClick={() => setDrawingMode(false)}>Cancel</button>
                </div>
              </div>
            )}

            {!drawingMode && !pendingRect && !selected && (
              <div className="panel-help">
                Click <kbd>+ New</kbd> then draw a region on the screenshot to annotate it.
                <br/>Or click an existing annotation to edit.
              </div>
            )}

            {(pendingRect || selected) && (
              <>
                <div className="field">
                  <label className="field-label">Title</label>
                  <input
                    autoFocus
                    value={form.title}
                    onChange={e => setForm({...form, title: e.target.value})}
                    placeholder="e.g. Confusing label"
                  />
                </div>
                <div className="field">
                  <label className="field-label">Commentary</label>
                  <textarea
                    value={form.commentary}
                    onChange={e => setForm({...form, commentary: e.target.value})}
                    placeholder="What did you observe? Why does it matter?"
                  />
                </div>

                {aiEnabled && (
                  <>
                    <button className="ai-suggest-btn" onClick={suggestTags} disabled={aiLoading}>
                      {aiLoading ? <><span className="spinner"></span> Thinking…</> : '✨ Suggest theme and sentiment'}
                    </button>
                    {aiRationale && <div className="ai-rationale">{aiRationale}</div>}
                  </>
                )}

                <div className="field">
                  <label className="field-label">Theme</label>
                  <select value={form.themeId} onChange={e => setForm({...form, themeId: e.target.value})}>
                    {themes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>

                <div className="field">
                  <label className="field-label">Sentiment</label>
                  <div className="sentiment-group">
                    {['positive', 'neutral', 'negative'].map(s => (
                      <button
                        key={s}
                        className={`sentiment-btn ${form.sentiment === s ? `active ${s}` : ''}`}
                        onClick={() => setForm({...form, sentiment: s})}
                      >
                        {s === 'positive' ? '👍 Positive' : s === 'negative' ? '👎 Negative' : '• Neutral'}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{display: 'flex', gap: 8, marginTop: 16}}>
                  <button className="btn btn-primary" onClick={saveAnnotation} disabled={saving} style={{flex: 1}}>
                    {saving ? <span className="spinner"></span> : selected ? 'Save changes' : 'Add annotation'}
                  </button>
                  {selected && <button className="btn btn-danger" onClick={deleteSelected}>Delete</button>}
                  <button className="btn" onClick={() => { setSelectedId(null); cancelDraft(); }}>Cancel</button>
                </div>
              </>
            )}
          </div>

          <div className="panel-section">
            <h3>All annotations on this capture ({annotations.length})</h3>
            {annotations.length === 0 ? (
              <div className="text-sm text-muted">No annotations yet.</div>
            ) : (
              annotations.map((a, i) => {
                const theme = themeById[a.themeId];
                return (
                  <div
                    key={a.id}
                    className={`annotation-list-item ${a.id === selectedId ? 'selected' : ''}`}
                    style={{borderLeftColor: theme?.color || '#7c5cff'}}
                    onClick={() => startEditSelected(a)}
                  >
                    <div className="title">{i + 1}. {a.title}</div>
                    <div className="meta">
                      <span className={`sentiment-tag ${a.sentiment}`}>{a.sentiment}</span>
                      <span>{theme?.name || 'Unknown'}</span>
                      <span>· {a.createdBy}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Syntheses tab
// ============================================================================

function SynthesesTab({ projectId, themes, annotations }) {
  const [selectedThemeId, setSelectedThemeId] = useState(themes[0]?.id || null);
  const [synthesis, setSynthesis] = useState({ learnings: '', suggestedFeatures: '', summary: '' });
  const [aiEnabled, setAiEnabled] = useState(false);
  const [draftingField, setDraftingField] = useState(null);
  const [saving, setSaving] = useState(false);
  const displayName = useDisplayName();
  const toast = useToast();

  useEffect(() => { setSelectedThemeId(themes[0]?.id || null); }, [themes]);

  useEffect(() => {
    (async () => {
      const h = await api.get('/health');
      setAiEnabled(h.aiEnabled);
    })();
  }, []);

  useEffect(() => {
    if (!selectedThemeId) return;
    (async () => {
      try {
        const s = await api.get(`/projects/${projectId}/themes/${selectedThemeId}/synthesis`);
        setSynthesis({
          learnings: s.learnings || '',
          suggestedFeatures: s.suggestedFeatures || '',
          summary: s.summary || '',
        });
      } catch (err) { toast(err.message, 'error'); }
    })();
  }, [projectId, selectedThemeId, toast]);

  const annotsForTheme = useMemo(
    () => annotations.filter(a => a.themeId === selectedThemeId),
    [annotations, selectedThemeId],
  );

  const annotCounts = useMemo(() => {
    const m = {};
    annotations.forEach(a => { m[a.themeId] = (m[a.themeId] || 0) + 1; });
    return m;
  }, [annotations]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/projects/${projectId}/themes/${selectedThemeId}/synthesis`, {
        ...synthesis,
        lastEditedBy: displayName,
      });
      toast('Saved', 'success');
    } catch (err) { toast(err.message, 'error'); }
    finally { setSaving(false); }
  };

  const draftAll = async () => {
    setDraftingField('all');
    try {
      const draft = await api.post('/ai/draft-synthesis', { projectId, themeId: selectedThemeId });
      setSynthesis(draft);
      toast('Draft generated — review and edit', 'success');
    } catch (err) { toast(err.message, 'error'); }
    finally { setDraftingField(null); }
  };

  if (themes.length === 0) return <div className="empty-state">No themes in this project yet.</div>;

  return (
    <div className="synthesis-layout">
      <div className="theme-sidebar">
        <div className="card-title" style={{margin: '0 0 10px'}}>Themes</div>
        {themes.map(t => (
          <div
            key={t.id}
            className={`sidebar-item ${t.id === selectedThemeId ? 'active' : ''}`}
            onClick={() => setSelectedThemeId(t.id)}
          >
            <span className="sidebar-dot" style={{background: t.color || '#7c5cff'}}></span>
            <span>{t.name}</span>
            <span className="count">{annotCounts[t.id] || 0}</span>
          </div>
        ))}
      </div>

      <div>
        {aiEnabled && (
          <div style={{marginBottom: 16, display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center'}}>
            <div className="text-muted text-sm">
              Pulling from {annotsForTheme.length} annotation{annotsForTheme.length !== 1 ? 's' : ''} for this theme.
            </div>
            <button className="btn btn-primary btn-sm" onClick={draftAll} disabled={draftingField === 'all' || annotsForTheme.length === 0}>
              {draftingField === 'all' ? <><span className="spinner"></span> Drafting…</> : '✨ Draft with AI'}
            </button>
          </div>
        )}

        {[
          { key: 'learnings', label: 'Learnings', hint: 'High-level findings, usually numbered. What did you learn from the sites?' },
          { key: 'suggestedFeatures', label: 'Suggested Features', hint: 'Concrete recommendations with rationale.' },
          { key: 'summary', label: 'Summary', hint: 'One paragraph tying the theme together.' },
        ].map(section => (
          <div key={section.key} className="synth-panel">
            <div className="panel-head">
              <h3 style={{fontSize: 16, fontWeight: 600}}>{section.label}</h3>
            </div>
            <textarea
              value={synthesis[section.key]}
              onChange={e => setSynthesis({...synthesis, [section.key]: e.target.value})}
              placeholder={section.hint}
            />
            <div className="hint">Supports Markdown. {section.hint}</div>
          </div>
        ))}

        <div style={{position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '12px 0', display: 'flex', justifyContent: 'flex-end', gap: 8}}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <><span className="spinner"></span> Saving</> : 'Save synthesis'}
          </button>
        </div>

        {annotsForTheme.length > 0 && (
          <div className="annotation-refs">
            <div className="card-title">Annotations for this theme</div>
            {annotsForTheme.map(a => (
              <div key={a.id} className="ref">
                <span className="site">{a.siteName}</span> · {a.captureStateLabel} · <strong>{a.title}</strong>
                {a.commentary && <><br/><span className="text-muted">{a.commentary}</span></>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Report tab — renders the assembled report
// ============================================================================

function ReportTab({ projectId }) {
  const [bundle, setBundle] = useState(null);
  const toast = useToast();

  useEffect(() => {
    (async () => {
      try { setBundle(await api.get(`/projects/${projectId}/report`)); }
      catch (err) { toast(err.message, 'error'); }
    })();
  }, [projectId, toast]);

  if (!bundle) return <div className="empty-state"><div className="spinner"></div></div>;

  const { project, themes, sites, syntheses, annotations, capturesBySite, performanceBySite } = bundle;
  const synthByTheme = Object.fromEntries(syntheses.map(s => [s.themeId, s]));
  const themeById = Object.fromEntries(themes.map(t => [t.id, t]));
  const md = (s) => ({ __html: window.marked ? window.marked.parse(s || '') : (s || '').replace(/\n/g, '<br>') });

  return (
    <div className="report">
      <h1 style={{fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em'}}>{project.name}</h1>
      {project.description && <p className="text-muted" style={{marginTop: 8, marginBottom: 24}}>{project.description}</p>}

      <div className="card" style={{marginBottom: 32}}>
        <div className="card-title">At a glance</div>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12}}>
          <div><strong style={{fontSize: 22}}>{sites.length}</strong><br/><span className="text-muted text-sm">Sites</span></div>
          <div><strong style={{fontSize: 22}}>{themes.length}</strong><br/><span className="text-muted text-sm">Themes</span></div>
          <div><strong style={{fontSize: 22}}>{annotations.length}</strong><br/><span className="text-muted text-sm">Annotations</span></div>
          <div><strong style={{fontSize: 22}}>{Object.values(capturesBySite).reduce((n, xs) => n + xs.length, 0)}</strong><br/><span className="text-muted text-sm">Captures</span></div>
        </div>
      </div>

      {themes.map(theme => {
        const s = synthByTheme[theme.id];
        const themeAnnots = annotations.filter(a => a.themeId === theme.id);
        const hasContent = s && (s.learnings || s.suggestedFeatures || s.summary);
        if (!hasContent && themeAnnots.length === 0) return null;
        return (
          <section key={theme.id}>
            <h2 className="report-theme" style={{borderBottomColor: theme.color}}>{theme.name}</h2>
            {theme.description && <p className="text-muted" style={{marginBottom: 20}}>{theme.description}</p>}
            {s?.learnings && <div><h3 className="report-section">Learnings</h3><div className="md-content" dangerouslySetInnerHTML={md(s.learnings)} /></div>}
            {s?.suggestedFeatures && <div><h3 className="report-section">Suggested Features</h3><div className="md-content" dangerouslySetInnerHTML={md(s.suggestedFeatures)} /></div>}
            {s?.summary && <div><h3 className="report-section">Summary</h3><div className="md-content" dangerouslySetInnerHTML={md(s.summary)} /></div>}
            {!hasContent && (
              <div className="text-muted" style={{padding: 16, background: 'var(--surface)', borderRadius: 8}}>
                <em>Theme has {themeAnnots.length} annotation{themeAnnots.length !== 1 ? 's' : ''} but no synthesis yet. Go to the Synthesise tab to write one.</em>
              </div>
            )}
          </section>
        );
      })}

      <h2 style={{fontSize: 28, marginTop: 64, marginBottom: 16}}>Per-site deep dives</h2>
      {sites.map(site => {
        const siteAnnots = annotations.filter(a => a.siteId === site.id);
        const perf = performanceBySite[site.id];
        const caps = capturesBySite[site.id] || [];
        return (
          <div key={site.id} className="report-site">
            <h2>{site.name}</h2>
            <div className="site-meta">
              <a href={site.url} target="_blank" rel="noopener noreferrer">{site.url}</a>
              {site.sector && <> · {site.sector}</>}
              {site.country && <> · {site.country}</>}
            </div>

            {perf && (
              <>
                <h3 className="report-section">Performance add-on</h3>
                <div className="perf-grid">
                  {perf.coreWebVitals?.lcp != null && (
                    <div className="perf-metric">
                      <div className="label">LCP</div>
                      <div className={`value ${perf.coreWebVitals.lcp < 2500 ? 'good' : perf.coreWebVitals.lcp < 4000 ? 'warn' : 'bad'}`}>
                        {Math.round(perf.coreWebVitals.lcp)}ms
                      </div>
                    </div>
                  )}
                  {perf.coreWebVitals?.cls != null && (
                    <div className="perf-metric">
                      <div className="label">CLS</div>
                      <div className={`value ${perf.coreWebVitals.cls < 0.1 ? 'good' : perf.coreWebVitals.cls < 0.25 ? 'warn' : 'bad'}`}>
                        {perf.coreWebVitals.cls.toFixed(3)}
                      </div>
                    </div>
                  )}
                  {perf.accessibility && (
                    <div className="perf-metric">
                      <div className="label">A11y score</div>
                      <div className={`value ${perf.accessibility.score >= 90 ? 'good' : perf.accessibility.score >= 70 ? 'warn' : 'bad'}`}>
                        {perf.accessibility.score}
                      </div>
                    </div>
                  )}
                  {perf.accessibility && (
                    <div className="perf-metric">
                      <div className="label">A11y violations</div>
                      <div className={`value ${perf.accessibility.violationCount === 0 ? 'good' : perf.accessibility.violationCount < 5 ? 'warn' : 'bad'}`}>
                        {perf.accessibility.violationCount}
                      </div>
                    </div>
                  )}
                  {perf.techStack && (
                    <div className="perf-metric">
                      <div className="label">Security headers</div>
                      <div className={`value ${perf.techStack.securityHeaders.score >= 80 ? 'good' : perf.techStack.securityHeaders.score >= 50 ? 'warn' : 'bad'}`}>
                        {perf.techStack.securityHeaders.score}
                      </div>
                    </div>
                  )}
                </div>
                {perf.techStack?.detected?.length > 0 && (
                  <p className="text-sm" style={{marginBottom: 16}}>
                    <strong>Detected:</strong> {perf.techStack.detected.map(d => d.name).join(', ')}
                  </p>
                )}
              </>
            )}

            {siteAnnots.length > 0 && (
              <>
                <h3 className="report-section">Observations</h3>
                {themes.map(theme => {
                  const ta = siteAnnots.filter(a => a.themeId === theme.id);
                  if (!ta.length) return null;
                  return (
                    <div key={theme.id} style={{marginBottom: 14}}>
                      <strong style={{color: theme.color}}>{theme.name}</strong>
                      <ul style={{marginTop: 6, marginLeft: 20}}>
                        {ta.map(a => (
                          <li key={a.id} style={{marginBottom: 4}}>
                            <span className={`sentiment-tag ${a.sentiment}`} style={{marginRight: 6}}>{a.sentiment}</span>
                            <strong>{a.title}</strong>
                            {a.commentary && <> — {a.commentary}</>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </>
            )}

            {caps.length > 0 && (
              <>
                <h3 className="report-section">Captures</h3>
                <div style={{display: 'flex', gap: 10, flexWrap: 'wrap'}}>
                  {caps.map(c => (
                    <a key={c.id} href={`#/captures/${c.id}`} style={{display: 'block', width: 160}}>
                      <div style={{width: 160, height: 100, background: `url(/screenshots/${c.screenshotPath}) top center/cover`, borderRadius: 4, border: '1px solid var(--border)'}}></div>
                      <div className="text-sm text-muted" style={{marginTop: 4}}>{c.stateLabel}</div>
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Root app — routing
// ============================================================================

function App() {
  const displayName = useDisplayName();
  const route = useRoute();
  const { parts, navigate } = route;

  // Routes:
  //   /                       → Dashboard
  //   /projects/:id           → ProjectView (default: sites)
  //   /projects/:id/sites
  //   /projects/:id/themes
  //   /projects/:id/syntheses
  //   /projects/:id/report
  //   /captures/:id           → AnnotationWorkspace

  if (parts[0] === 'captures' && parts[1]) {
    // AnnotationWorkspace provides its own topbar with detailed crumbs
    return <AnnotationWorkspace captureId={parts[1]} />;
  }

  let body;
  let crumbs = [];
  if (parts.length === 0) {
    body = <Dashboard />;
  } else if (parts[0] === 'projects' && parts[1]) {
    body = <ProjectView projectId={parts[1]} />;
    // Project view manages its own breadcrumbs via page header; topbar stays simple
  } else {
    body = <div className="main"><div className="empty-state">Page not found. <a href="#/">Go home</a></div></div>;
  }

  return (
    <div className="app">
      <TopBar displayName={displayName} crumbs={crumbs} />
      {body}
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

ReactDOM.createRoot(document.getElementById('root')).render(
  <ToastProvider>
    <App />
  </ToastProvider>,
);
