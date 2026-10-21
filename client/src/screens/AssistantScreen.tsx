import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AssistantMessage, ImageToVideoPlan, ProposedEdit, TextToVideoPlan, VideoAnalysis } from '@shared/types.js';
import { SUGGESTIONS } from '@shared/ai-commands.js';
import { api, ApiError, type ServerStatus } from '../lib/api.js';
import { useEditor } from '../state/editorStore.js';
import { useAppStore } from '../state/appStore.js';
import { useT } from '../lib/useT.js';
import { Button, Card, Chip, EmptyState, Segmented, Spinner, TextInput } from '../components/ui/primitives.js';
import { Icon } from '../components/ui/Icon.js';
import { toast } from '../state/toastStore.js';
import { formatDuration } from '../lib/format.js';
import { addClip, addTrack, createTextClip } from '@shared/project-ops.js';
import { loadProject, saveProject } from '../storage/repository.js';

type Tab = 'chat' | 'text' | 'image' | 'edit';

const TAB_TO_WORKFLOW: Record<string, Tab> = {
  'text-to-video': 'text',
  'image-to-video': 'image',
  'edit-existing': 'edit',
};

function readChatHistory(key: string): AssistantMessage[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-100).filter((item): item is AssistantMessage =>
      Boolean(item && typeof item === 'object' && typeof (item as AssistantMessage).id === 'string' &&
        ((item as AssistantMessage).role === 'user' || (item as AssistantMessage).role === 'assistant') &&
        typeof (item as AssistantMessage).text === 'string'),
    );
  } catch {
    return [];
  }
}

export function AssistantScreen() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const project = useEditor((state) => state.project);
  const selectedClipId = useEditor((state) => state.selectedClipId);
  const applyOperations = useEditor((state) => state.applyProposedOperations);
  const openProject = useEditor((state) => state.openProject);
  const createProject = useAppStore((state) => state.createProject);

  const [tab, setTab] = useState<Tab>(TAB_TO_WORKFLOW[params.get('workflow') ?? ''] ?? 'chat');
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const activeHistoryKey = `xorvyne.assistant.${project?.id ?? 'global'}`;
  const [historyKey, setHistoryKey] = useState(activeHistoryKey);
  const [messages, setMessages] = useState<AssistantMessage[]>(() => readChatHistory(activeHistoryKey));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api
      .status()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    setTab(TAB_TO_WORKFLOW[params.get('workflow') ?? ''] ?? 'chat');
  }, [params]);

  useEffect(() => {
    if (historyKey === activeHistoryKey) return;
    setHistoryKey(activeHistoryKey);
    setMessages(readChatHistory(activeHistoryKey));
  }, [activeHistoryKey, historyKey]);

  useEffect(() => {
    if (historyKey !== activeHistoryKey || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(historyKey, JSON.stringify(messages.slice(-100)));
    } catch {
      // Chat history is optional and stays on this device; storage may be full.
    }
  }, [activeHistoryKey, historyKey, messages]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const providerChip = useMemo(() => {
    const provider = status?.providers.find((item) => item.id === 'command-parser');
    if (!provider) return <Chip tone="demo">Demo mode</Chip>;
    return provider.mode === 'live' ? <Chip tone="live">Live provider</Chip> : <Chip tone="demo">Demo mode</Chip>;
  }, [status]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput('');
    const userMessage: AssistantMessage = {
      id: `msg_${Date.now().toString(36)}`,
      role: 'user',
      text: trimmed,
      createdAt: Date.now(),
    };
    setMessages((current) => [...current, userMessage]);
    setBusy(true);
    try {
      const response = await api.command({
        message: trimmed,
        project: {
          id: project?.id ?? 'none',
          name: project?.name ?? 'No project',
          settings: project?.settings ?? {
            width: 1920,
            height: 1080,
            fps: 30,
            backgroundColor: '#000000',
            sampleRate: 48000,
            gridMs: 500,
            snapToGrid: true,
            zoom: 60,
            autoSave: true,
          },
          tracks: project?.tracks ?? [],
          clips: project?.clips ?? [],
          assets: project?.assets ?? [],
          selectedClipId,
        },
      });
      const assistantMessage: AssistantMessage = {
        id: `msg_${Date.now().toString(36)}_r`,
        role: 'assistant',
        text: response.reply,
        createdAt: Date.now(),
        proposal: response.proposal ?? undefined,
        status: response.proposal ? 'pending' : undefined,
        mode: response.mode,
      };
      setMessages((current) => [...current, assistantMessage]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `msg_${Date.now().toString(36)}_e`,
          role: 'assistant',
          text:
            error instanceof ApiError
              ? error.message
              : 'The assistant could not be reached. Is the XORVYNE server running?',
          createdAt: Date.now(),
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const applyProposal = (proposal: ProposedEdit) => {
    if (!project) {
      toast.warning('Open a project first — the proposal needs a timeline to apply to.');
      return;
    }
    applyOperations(proposal.operations, proposal.summary);
    setMessages((current) =>
      current.map((message) =>
        message.proposal?.id === proposal.id ? { ...message, status: 'applied' } : message,
      ),
    );
    toast.success('Change applied to the timeline.');
  };

  const cancelProposal = (proposal: ProposedEdit) => {
    setMessages((current) =>
      current.map((message) =>
        message.proposal?.id === proposal.id ? { ...message, status: 'cancelled' } : message,
      ),
    );
  };

  return (
    <div className="page assistant">
      <header className="page-header">
        <div className="page-header__row">
          <div>
            <span className="eyebrow">Copilot</span>
            <h1>{t('assistant.title')}</h1>
          </div>
          <div className="row">
            {providerChip}
            {tab === 'chat' && messages.length > 0 ? (
              <Button size="sm" variant="ghost" icon="trash" onClick={() => setMessages([])}>
                {t('assistant.clear')}
              </Button>
            ) : null}
          </div>
        </div>
        <p className="lede">{t('assistant.subtitle')}</p>
        <Segmented
          ariaLabel="Assistant mode"
          value={tab}
          onChange={(value) => {
            setTab(value);
            setParams(value === 'chat' ? {} : { workflow: value === 'text' ? 'text-to-video' : value === 'image' ? 'image-to-video' : 'edit-existing' });
          }}
          options={[
            { value: 'chat', label: 'Chat' },
            { value: 'text', label: t('home.t2v') },
            { value: 'image', label: t('home.i2v') },
            { value: 'edit', label: t('home.e2v') },
          ]}
        />
        {status ? (
          <p className="text-xs text-mute">
            {status.providers.find((item) => item.id === 'command-parser')?.detail ??
              'Command parsing runs locally in demo mode. No paid API is used.'}
          </p>
        ) : null}
      </header>

      {tab === 'chat' ? (
        <section className="assistant__chat">
          <div className="chat" ref={listRef}>
            {messages.length === 0 ? (
              <EmptyState
                icon="sparkles"
                title={t('assistant.empty')}
                text="Commands are parsed into real timeline operations — you always approve them first."
              />
            ) : null}
            {messages.map((message) => (
              <div key={message.id} className={`message message--${message.role}`}>
                <div className="message__bubble">
                  <p>{message.text}</p>
                  {message.proposal ? (
                    <ProposalCard
                      proposal={message.proposal}
                      status={message.status}
                      onApply={() => applyProposal(message.proposal!)}
                      onCancel={() => cancelProposal(message.proposal!)}
                    />
                  ) : null}
                </div>
              </div>
            ))}
            {busy ? (
              <div className="message message--assistant">
                <div className="message__bubble row" style={{ gap: 8 }}>
                  <Spinner size={14} /> <span className="text-sm text-mute">Thinking…</span>
                </div>
              </div>
            ) : null}
          </div>

          {messages.length === 0 ? (
            <div className="row">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} type="button" className="chip" onClick={() => void send(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}

          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <input
              className="input"
              value={input}
              placeholder={t('assistant.placeholder')}
              onChange={(event) => setInput(event.target.value)}
            />
            <Button type="submit" variant="primary" icon="send" disabled={busy || !input.trim()}>
              {t('assistant.send')}
            </Button>
          </form>
        </section>
      ) : null}

      {tab === 'text' ? <TextToVideoPanel onBuildProject={async (plan) => {
        const id = await createProject(plan.title);
        const created = await loadProject(id);
        if (!created) return;
        const withTrack = addTrack(created, 'text', 'Storyboard');
        let next = withTrack.project;
        let cursor = 0;
        for (const shot of plan.shots) {
          const clip = createTextClip({
            trackId: withTrack.track.id,
            startMs: cursor,
            durationMs: shot.durationMs,
            text: { content: `${shot.index + 1}. ${shot.title}\n${shot.description}`, fontSize: 48, y: 0.5 },
            name: shot.title,
          });
          next = addClip(next, clip);
          cursor += shot.durationMs;
        }
        next = { ...next, meta: { createdFrom: 'ai', aiWorkflow: 'text-to-video' } };
        await saveProject(next);
        openProject(next);
        toast.success('Storyboard project created — open the editor to refine it.');
      }} /> : null}

      {tab === 'image' ? <ImageToVideoPanel /> : null}
      {tab === 'edit' ? <EditExistingPanel /> : null}
    </div>
  );
}

function ProposalCard({
  proposal,
  status,
  onApply,
  onCancel,
}: {
  proposal: ProposedEdit;
  status?: AssistantMessage['status'];
  onApply: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <div className="proposal">
      <div className="row row--between">
        <span className="eyebrow">Proposed change</span>
        {status === 'applied' ? <Chip tone="success">Applied</Chip> : null}
        {status === 'cancelled' ? <Chip>Cancelled</Chip> : null}
      </div>
      <p className="proposal__summary">{proposal.summary}</p>
      <ul className="proposal__details">
        {proposal.details.map((detail, index) => (
          <li key={index}>{detail}</li>
        ))}
      </ul>
      {proposal.warnings.length > 0 ? (
        <div className="proposal__warning">
          <Icon name="warning" size={14} />
          <span>{proposal.warnings.join(' ')}</span>
        </div>
      ) : null}
      {status !== 'applied' && status !== 'cancelled' ? (
        <div className="row">
          <Button size="sm" variant="primary" icon="check" onClick={onApply}>
            {t('assistant.apply')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {t('assistant.cancel')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function TextToVideoPanel({ onBuildProject }: { onBuildProject: (plan: TextToVideoPlan) => Promise<void> }) {
  const t = useT();
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('cinematic');
  const [duration, setDuration] = useState(30);
  const [plan, setPlan] = useState<TextToVideoPlan | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const result = await api.textToVideo({ prompt, style, durationMs: duration * 1000 });
      setPlan(result);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'The plan could not be generated.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="stack">
      <Card>
        <span className="eyebrow">{t('home.t2v')}</span>
        <p className="text-sm text-mute">
          The planner turns a prompt into a shot list. In demo mode no footage is generated — you get a real,
          editable storyboard project with title cards you can replace with your own media.
        </p>
        <TextInput
          label="Prompt"
          placeholder="A lone traveller crosses a neon desert at dusk…"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <div className="row">
          <label className="field__label" htmlFor="t2v-style">
            Style
          </label>
          <select
            id="t2v-style"
            className="select"
            style={{ maxWidth: 200 }}
            value={style}
            onChange={(event) => setStyle(event.target.value)}
          >
            {['cinematic', 'documentary', 'anime', 'vlog', 'product', 'noir'].map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <label className="field__label" htmlFor="t2v-duration">
            Seconds
          </label>
          <input
            id="t2v-duration"
            className="input"
            type="number"
            min={10}
            max={180}
            style={{ maxWidth: 90 }}
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value) || 30)}
          />
        </div>
        <Button variant="primary" icon="wand" onClick={() => void run()} disabled={busy || prompt.trim().length < 3}>
          {busy ? 'Planning…' : 'Build storyboard'}
        </Button>
      </Card>

      {plan ? (
        <Card className="stack">
          <div className="row row--between">
            <h3>{plan.title}</h3>
            <Chip tone={plan.mode === 'live' ? 'live' : 'demo'}>
              {plan.mode === 'live' ? 'Live provider' : 'Demo mode'}
            </Chip>
          </div>
          <p className="text-sm">{plan.summary}</p>
          <div className="stack">
            {plan.shots.map((shot) => (
              <div key={shot.index} className="shot">
                <span className="shot__index mono">{String(shot.index + 1).padStart(2, '0')}</span>
                <div className="flex-1" style={{ minWidth: 0 }}>
                  <span className="text-sm" style={{ display: 'block', fontWeight: 600 }}>
                    {shot.title}
                  </span>
                  <span className="text-xs text-mute">{shot.description}</span>
                  <span className="text-xs text-mute" style={{ display: 'block' }}>
                    {shot.cameraNote}
                  </span>
                </div>
                <span className="chip mono">{formatDuration(shot.durationMs)}</span>
              </div>
            ))}
          </div>
          <Button variant="primary" icon="plus" onClick={() => void onBuildProject(plan)}>
            Create editable project
          </Button>
          <p className="text-xs text-mute">
            {plan.footageGenerated
              ? 'A provider produced real footage for this storyboard.'
              : 'No footage was generated — the storyboard uses title cards as real, editable clips.'}
          </p>
        </Card>
      ) : null}
    </section>
  );
}

function ImageToVideoPanel() {
  const t = useT();
  const project = useEditor((state) => state.project);
  const imageAssets = project?.assets.filter((asset) => asset.kind === 'image' && asset.status === 'ready') ?? [];
  const addAssetToTimeline = useEditor((state) => state.addAssetToTimeline);
  const setClipEffect = useEditor((state) => state.setClipEffect);
  const [prompt, setPrompt] = useState('');
  const [motion, setMotion] = useState('slow push-in');
  const [plan, setPlan] = useState<ImageToVideoPlan | null>(null);
  const [imageId, setImageId] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      setPlan(await api.imageToVideo({ prompt, motion }));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'The plan could not be generated.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="stack">
      <Card>
        <span className="eyebrow">{t('home.i2v')}</span>
        <p className="text-sm text-mute">
          Image-to-video needs a rendering provider. Without one, XORVYNE returns a real camera-move plan that you
          can apply to a still image as a Ken Burns clip.
        </p>
        <TextInput
          label="Describe the shot"
          placeholder="A lighthouse at storm dusk, heavy atmosphere…"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <TextInput label="Camera move" value={motion} onChange={(event) => setMotion(event.target.value)} />
        {project ? (
          imageAssets.length > 0 ? (
            <label className="field">
              <span className="field__label">Imported still to animate</span>
              <select className="select" value={imageId || imageAssets[0].id} onChange={(event) => setImageId(event.target.value)}>
                {imageAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
              </select>
            </label>
          ) : <p className="text-xs text-mute">Import an image in the editor first to apply this plan to a real still.</p>
        ) : <p className="text-xs text-mute">Open a project and import an image to apply this plan.</p>}
        <Button variant="primary" icon="wand" onClick={() => void run()} disabled={busy || prompt.trim().length < 3}>
          {busy ? 'Planning…' : 'Plan camera move'}
        </Button>
      </Card>
      {plan ? (
        <Card className="stack">
          <div className="row row--between">
            <h3>Camera plan</h3>
            <Chip tone={plan.mode === 'live' ? 'live' : 'demo'}>
              {plan.mode === 'live' ? 'Live provider' : 'Demo mode'}
            </Chip>
          </div>
          <p className="text-sm">{plan.summary}</p>
          <ul className="proposal__details">
            {plan.cameraMoves.map((move) => (
              <li key={move}>{move}</li>
            ))}
          </ul>
          {plan.notes.map((note) => (
            <p key={note} className="text-xs text-mute">
              {note}
            </p>
          ))}
          {project && imageAssets.length > 0 ? (
            <Button
              variant="primary"
              icon="film"
              onClick={() => {
                const asset = imageAssets.find((item) => item.id === (imageId || imageAssets[0].id));
                if (!asset) return;
                const clipId = addAssetToTimeline(asset);
                if (!clipId) return;
                setClipEffect(clipId, {
                  id: `fx_kenburns_${Date.now().toString(36)}`,
                  type: 'kenburns',
                  enabled: true,
                  params: { amount: 1.2 },
                });
                toast.success('A real still-image clip with a Ken Burns push-in was added to the timeline.');
              }}
            >
              Apply to imported image
            </Button>
          ) : null}
        </Card>
      ) : null}
    </section>
  );
}

function EditExistingPanel() {
  const t = useT();
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState('');
  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const uploaded = await api.uploadMedia(file, file.name);
      setAnalysis(await api.editExisting({ prompt, fileName: file.name, uploadToken: uploaded.token }));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'The file could not be analysed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="stack">
      <Card>
        <span className="eyebrow">{t('home.e2v')}</span>
        <p className="text-sm text-mute">
          The file is analysed on the local server (real metadata, real duration and resolution) and is never stored
          permanently.
        </p>
        <input
          className="input"
          type="file"
          accept="video/*"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <TextInput
          label="What should change?"
          placeholder="Tighten the intro and add subtitles…"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <Button variant="primary" icon="wand" onClick={() => void run()} disabled={busy || !file}>
          {busy ? 'Analysing…' : 'Analyse footage'}
        </Button>
      </Card>
      {analysis ? (
        <Card className="stack">
          <div className="row row--between">
            <h3>Analysis</h3>
            <Chip tone={analysis.mode === 'live' ? 'live' : 'demo'}>
              {analysis.mode === 'live' ? 'Live provider' : 'Demo mode'}
            </Chip>
          </div>
          <div className="row">
            <Chip>{analysis.width}×{analysis.height}</Chip>
            <Chip>{analysis.fps} fps</Chip>
            <Chip>{formatDuration(analysis.durationMs)}</Chip>
            <Chip>{analysis.hasAudio ? 'Audio' : 'No audio'}</Chip>
          </div>
          <ul className="proposal__details">
            {analysis.signals.map((signal) => (
              <li key={signal.name}>
                {signal.name}: {signal.value}
              </li>
            ))}
          </ul>
          {analysis.notes.map((note) => (
            <p key={note} className="text-xs text-mute">
              {note}
            </p>
          ))}
        </Card>
      ) : null}
    </section>
  );
}
