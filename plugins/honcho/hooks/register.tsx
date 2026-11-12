import type { Register, EngineInterface, RenderChildren, UiPressArgument } from 'claude-code'

const PANE = 'honcho'
const HONCHO_TOOL = /^mcp__plugin_honcho_honcho__/
const VERBS: Record<string, string> = {
  chat: 'asking', search: 'searching', create_conclusion: 'writing',
  delete_conclusion: 'writing', list_conclusions: 'listing',
}

type Ref = { id: string; content: string | null; level?: string; status: string; removed_in_run?: string | null }
type Run = {
  id: string; observer_id: string; observed_id: string; dream_type: string; trigger_reason: string
  status: 'running' | 'completed' | 'failed' | 'interrupted'
  created_count: number; removed_count: number; peer_card_updated: boolean
  started_at: string; finished_at: string | null; pruned_at: string | null
}
type RunDetail = Run & {
  created: { conclusion: Ref; sources: Ref[]; specialist?: string }[]
  removed: { id: string; content: string | null; level?: string; replaced_by?: string | null }[]
  peer_card: { before: string[] | null; after: string[] | null } | null
}
type Overview = {
  session: string | null; sessionUrl: string | null; card: string[]
}
type Reply<T> = { ok: true; workspace: string; peer: string; origin: string; data: T } | { ok: false; status?: number; error: string }

// The running memory tool's verb, shown after the spinner word.
let activity: string | undefined
let noticeShown = false
let dreams: { loading: boolean; error?: string; runs: Run[]; peer?: string; workspace?: string; at?: number } = { loading: false, runs: [] }
let overview: { loading: boolean; error?: string; data?: Overview } = { loading: false }
// The Claude Code session the overview was loaded for; a new one (after /clear) reloads it.
let overviewFor: string | undefined
let detail: { loading: boolean; error?: string; run?: RunDetail } | undefined
let cardOpen = false

type SetupState = {
  connected: boolean; canSignIn: boolean; auth: string | null
  workspace: string | null; peer: string | null; transcripts: number
  hasName: boolean; suggestedName: string; others: { host: string; peerName: string }[]
}
type SetupReply = { ok: boolean; error?: string; status?: string; url?: string; code?: string } & Partial<SetupState>
// Undefined until the first check at session start.
let connected: boolean | undefined
let setup: {
  busy?: string; error?: string; state?: SetupState; done?: boolean
  signIn?: { url: string; code: string }; askKey?: boolean; askName?: boolean
} | undefined
let poller: { cancel: () => void } | undefined
// Asked of the engine each time, never kept in a module variable: a reload resets
// module variables while the pane stays up, and the status-bar button, /honcho and
// the pane's own mark can each close it.
async function paneIsOpen($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some((pane) => pane.id === PANE)
}

async function home($: EngineInterface): Promise<string> {
  return (await $.env.get('HOME')) ?? ''
}

async function readJson<T>($: EngineInterface, path: string): Promise<T | undefined> {
  try {
    if (!(await $.fs.exists(path))) return undefined
    const text = await $.fs.read(path)
    return typeof text === 'string' ? (JSON.parse(text) as T) : undefined
  } catch {
    return undefined
  }
}

// Written by the session hooks.
async function sessionInfo($: EngineInterface): Promise<{ name?: string; url?: string | null } | undefined> {
  return readJson($, `${await home($)}/.honcho/session-${await $.session.id()}.json`)
}

// Runs one of src/skills/*-runner.ts: bundled JS when published, source in a checkout.
async function script($: EngineInterface, name: string, args: string[], timeoutMs: number, stdin?: string) {
  const built = `${$.plugin.root}/dist/skills/${name}.js`
  const argv = (await $.fs.exists(built))
    ? ['node', built, ...args]
    : ['bun', 'run', `${$.plugin.root}/src/skills/${name}.ts`, ...args]
  return $.process.run(argv, { timeoutMs, stdin, env: { CLAUDE_CODE_SESSION_ID: await $.session.id() } })
}

async function runner($: EngineInterface, args: string[], stdin?: string): Promise<Reply<unknown>> {
  try {
    const { exitCode, stdout, stderr } = await script($, 'pane-runner', args, 30000, stdin)
    if (exitCode !== 0) return { ok: false, error: (stderr || stdout).trim().slice(0, 300) }
    return JSON.parse(stdout.trim().split('\n').pop() ?? '{}')
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

function explain(r: { status?: number; error: string }): string {
  if (r.status === 404) return 'Dream history is not available on this Honcho server yet.'
  if (r.status === 401) return 'Honcho rejected your sign-in or API key. Run /honcho setup to connect again.'
  if (r.status === 403) return 'Needs a workspace or admin key; peer-scoped keys are refused.'
  let detail = r.error
  try { detail = JSON.parse(r.error).detail ?? r.error } catch { /* not JSON */ }
  if (r.status && r.status >= 500) return `Honcho server error (${r.status}): ${detail}. Try refresh in a minute.`
  return detail
}

async function loadDreams($: EngineInterface): Promise<void> {
  dreams = { ...dreams, loading: true, error: undefined }
  $.ui.invalidate('ui.render')
  const r = (await runner($, ['dreams-list'])) as Reply<{ items: Run[] }>
  dreams = r.ok
    ? { loading: false, runs: r.data?.items ?? [], peer: r.peer, workspace: r.workspace, at: Date.now() }
    : { loading: false, runs: [], error: explain(r) }
  $.ui.invalidate('ui.render')
}

async function loadOverview($: EngineInterface): Promise<void> {
  overviewFor = await $.session.id()
  overview = { ...overview, loading: true, error: undefined }
  $.ui.invalidate('ui.render')
  const r = (await runner($, ['overview'])) as { ok: boolean; status?: number; error?: string } & Overview
  overview = r.ok ? { loading: false, data: r } : { loading: false, error: explain({ status: r.status, error: r.error ?? '' }) }
  $.ui.invalidate('ui.render')
}

const loadAll = ($: EngineInterface) => Promise.all([loadOverview($), loadDreams($)])

async function loadDetail($: EngineInterface, id: string): Promise<void> {
  detail = { loading: true }
  $.ui.invalidate('ui.render')
  const r = (await runner($, ['dreams-get', id])) as Reply<RunDetail>
  detail = r.ok ? { loading: false, run: r.data } : { loading: false, error: explain(r) }
  $.ui.invalidate('ui.render')
}

async function togglePane($: EngineInterface): Promise<string> {
  if (await paneIsOpen($)) {
    await $.ui.close({ id: PANE })
    return 'Honcho pane closed.'
  }
  return openPane($)
}

async function openSetup($: EngineInterface): Promise<string> {
  detail = undefined
  cardOpen = false
  setup = { busy: 'Checking your Honcho connection…' }
  const opened = await $.ui.open({ id: PANE, title: 'Honcho setup' })
  void (async () => {
    const r = (await runner($, ['setup-state'])) as SetupReply
    if (!r.ok) return setSetup($, { error: r.error })
    const state = r as SetupState
    if (!state.connected) return setSetup($, { state })
    setSetup($, { busy: 'Checking your connection…', state })
    finishSetup($, (await runner($, ['setup-connect'])) as SetupReply)
  })()
  return opened.isPlaced ? 'Honcho setup opened.' : `Honcho setup is waiting for room (${opened.reason}).`
}

function setSetup($: EngineInterface, next: NonNullable<typeof setup>): void {
  setup = next
  $.ui.invalidate('ui.render')
}

function finishSetup($: EngineInterface, r: SetupReply): void {
  if (!r.ok) {
    // The saved credential (or the one just entered) didn't work: offer the ways to connect again.
    const state = setup?.state && { ...setup.state, connected: false }
    return setSetup($, { ...setup, state, busy: undefined, signIn: undefined, error: r.error })
  }
  connected = true
  const state = r as SetupState
  if (state.hasName) return setSetup($, { state, done: true })
  // First connection: ask what Honcho should call the user.
  setSetup($, { state, askName: true })
  void $.ui.open({ id: PANE, title: 'Honcho setup', focus: true })
    .then(() => $.ui.focus({ requestId: PANE, key: 'name' })).catch(() => {})
}

async function saveName($: EngineInterface, name: string): Promise<void> {
  setSetup($, { ...setup, busy: 'Saving…', error: undefined })
  finishSetup($, (await runner($, ['setup-name'], name)) as SetupReply)
}

function otherNames(others: SetupState['others']): string {
  const names = new Set(others.map((o) => o.peerName))
  if (names.size !== 1) return others.map((o) => `${o.host} calls you ${o.peerName}`).join('; ') + '.'
  const hosts = others.map((o) => o.host)
  return `${hosts.length > 1 ? hosts.slice(0, -1).join(', ') + ' and ' + hosts[hosts.length - 1] : hosts[0]} ${hosts.length > 1 ? 'call' : 'calls'} you ${[...names][0]}.`
}

async function signIn($: EngineInterface): Promise<void> {
  setSetup($, { ...setup, busy: 'Opening sign-in…', error: undefined })
  const r = (await runner($, ['signin-start'])) as SetupReply
  if (!r.ok || !r.url || !r.code) return setSetup($, { ...setup, busy: undefined, error: r.error })
  setSetup($, { ...setup, busy: undefined, signIn: { url: r.url, code: r.code } })
  // Each check waits up to 15s for approval; stop if the pane closed or was cancelled.
  while (setup?.signIn) {
    const c = (await runner($, ['signin-check'])) as SetupReply
    if (!setup?.signIn) return
    if (c.status === 'waiting') continue
    if (c.status === 'error') { await $.clock.sleep(3000); continue }
    if (c.status === 'approved') return finishSetup($, c)
    return setSetup($, {
      ...setup, signIn: undefined,
      error: c.status === 'denied' ? 'Sign-in was denied.' : 'The sign-in code expired. Try again.',
    })
  }
}

// The pane must hold the keyboard, or typing lands in Claude's prompt.
async function askForKey($: EngineInterface): Promise<void> {
  setSetup($, { ...setup, askKey: true, error: undefined })
  await $.ui.open({ id: PANE, title: 'Honcho setup', focus: true })
  await $.ui.focus({ requestId: PANE, key: 'key' }).catch(() => {})
}

async function saveKey($: EngineInterface, key: string): Promise<void> {
  setSetup($, { ...setup, busy: 'Checking the key…', error: undefined })
  finishSetup($, (await runner($, ['setup-key'], key)) as SetupReply)
}

async function openPane($: EngineInterface): Promise<string> {
  if (connected === false) return openSetup($)
  setup = undefined
  detail = undefined
  cardOpen = false
  const opened = await $.ui.open({ id: PANE, title: 'Honcho' })
  void loadAll($)
  // Poll only while a run is in progress.
  poller?.cancel()
  poller = $.clock.every(15000, () => {
    if (dreams.runs.some((r) => r.status === 'running')) void loadDreams($)
  })
  return opened.isPlaced ? 'Honcho pane opened.' : `Honcho pane is waiting for room (${opened.reason}).`
}

function ago(iso: string | null): string {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 90) return `${Math.round(s)}s ago`
  if (s < 5400) return `${Math.round(s / 60)}m ago`
  if (s < 129600) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

const GLYPH: Record<Run['status'], string> = { running: '◐', completed: '●', failed: '✕', interrupted: '◌' }
const COLOR: Record<Run['status'], string> = { running: 'yellow', completed: 'green', failed: 'red', interrupted: 'gray' }

function clip(text: string | null | undefined, width: number): string {
  const t = (text ?? '(unavailable)').replace(/\s+/g, ' ')
  return t.length > width ? t.slice(0, width - 1) + '…' : t
}

async function tryOpen($: EngineInterface, url: string): Promise<boolean> {
  for (const opener of ['open', 'xdg-open']) {
    try {
      if ((await $.process.run([opener, url])).exitCode === 0) return true
    } catch { /* not on this platform */ }
  }
  return false
}

async function openUrl($: EngineInterface, url: string): Promise<void> {
  if (!(await tryOpen($, url))) $.ui.toast(url)
}

// Opens the page and also copies the link, so it can be pasted elsewhere.
async function openSession($: EngineInterface, url: string, press: UiPressArgument): Promise<void> {
  const [opened, copy] = await Promise.all([
    tryOpen($, url),
    $.ui.copy({ text: url, surface: press.surface }).catch(() => ({ isCopied: false })),
  ])
  $.ui.toast(
    opened && copy.isCopied ? 'Opened in your browser; link copied.'
    : opened ? 'Opened in your browser.'
    : copy.isCopied ? 'Link copied.'
    : url,
  )
}

function textOf(result: { content: { type: string; text?: string }[] }): string {
  return result.content.map((b) => b.text ?? '').join('\n')
}

async function mcp($: EngineInterface, tool: string, args?: Record<string, unknown>): Promise<string> {
  const conn = await $.mcp.connect('honcho')
  if (!('server' in conn) || !conn.server) return 'Honcho MCP server is not connected.'
  return textOf(await $.mcp.call(conn.server, tool, args))
}

const ANSI = /\x1b\[[0-9;]*m/g

// .catch(next) on wrapping hooks: a failure here never blocks the hook or tool beneath.
export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.env.set('HONCHO_MOD_UI', '1')
    await $.command.register({
      name: 'honcho',
      description: 'Open the Honcho pane, or setup | status | config | set | import',
      argumentHint: '[setup | status | config | set <field> <value> | import [--days N] [--yes]]',
      immediate: true,
    })
    void runner($, ['setup-state']).then((r) => {
      if (r.ok) connected = (r as SetupReply).connected
      $.ui.invalidate('ui.render')
    })
    return next(e)
  })


  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const button = (
      <Button key="honcho" plain label="honcho" onPress={() => void togglePane($)}>
        {connected === false
          ? <Text color="yellow">○ honcho · set up</Text>
          : <Text color="cyan">● honcho</Text>}
      </Button>
    )
    if (e.props.modes.length === 0) return button
    return (
      <Box flexDirection="row" gap={2}>
        {await next(e)}
        {button}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  // user-prompt.ts writes the version nag here when the mod is on.
  on('classic.UserPromptSubmit', async ($, e, next) => {
    const result = await next(e)
    if (!noticeShown) {
      const n = await readJson<{ text?: string }>($, `${await home($)}/.honcho/notice-${await $.session.id()}.json`)
      if (n?.text) {
        noticeShown = true
        const v = n.text.match(/v(\S+) installed, v(\S+) available/)
        $.ui.toast(v ? `v${v[2]} is out (you have v${v[1]}). Update in /plugins.` : n.text, { timeoutMs: 10000 })
      }
    }
    return result
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: HONCHO_TOOL }, async ($, e, next) => {
    const verb = String(e.tool).replace(HONCHO_TOOL, '')
    activity = VERBS[verb] ?? verb
    $.ui.invalidate('ui.render')
    try {
      return await next(e)
    } finally {
      activity = undefined
      $.ui.invalidate('ui.render')
    }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Spinner' }, async ($, e, next) =>
    activity
      ? next({ ...e, props: { ...e.props, suffix: `${e.props.suffix ?? ''} · honcho ${activity}…` } })
      : next(e),
  )

  on('command.run', { command: 'honcho' }, async ($, e) => {
    const [sub = 'pane', field, ...value] = e.args.trim().split(/\s+/).filter(Boolean)
    switch (sub) {
      case 'status': {
        const r = await script($, 'status-runner', [], 20000)
        const s = await sessionInfo($)
        const link = s?.url ? `\n  View session: ${s.url}` : ''
        return { text: (r.stdout || r.stderr).replace(ANSI, '').trim() + link }
      }
      case 'config': {
        const raw = await mcp($, 'get_config')
        try { return { text: JSON.parse(raw).card ?? raw } } catch { return { text: raw } }
      }
      case 'import': {
        const rest = e.args.trim().split(/\s+/).slice(1)
        const upload = rest.includes('--yes')
        const r = await script($, 'backfill-runner', upload ? rest : [...rest, '--dry-run'], 600000)
        const out = (r.stdout || r.stderr).replace(ANSI, '').trim()
        return { text: upload ? out : `${out}\n\nRun /honcho import --yes to upload.` }
      }
      case 'set': {
        if (!field || value.length === 0) return { text: 'Usage: /honcho set <field> <value>' }
        const raw = value.join(' ')
        let parsed: unknown = raw
        try { parsed = JSON.parse(raw) } catch { /* plain string */ }
        // The user typed the command, which is the confirmation set_config asks for.
        return { text: await mcp($, 'set_config', { field, value: parsed, confirm: true }) }
      }
      case 'setup':
        return { text: await openSetup($) }
      case 'pane':
      case 'dreams':
        return { text: await togglePane($) }
      default:
        return { text: 'Usage: /honcho [setup | status | config | set <field> <value> | import [--days N] [--yes]]' }
    }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    poller?.cancel()
    poller = undefined
    setup = undefined
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if ((await paneIsOpen($)) && (await $.session.id()) !== overviewFor) void loadOverview($)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const width = Math.max(20, (e.props.bodyColumns ?? 60) - 4)

    const back = () => { detail = undefined; cardOpen = false; $.ui.invalidate('ui.render') }

    if (setup) {
      const { Input } = $.ui.resolve(e)
      const st = setup.state
      const choosing = st && !st.connected && !setup.done && !setup.signIn && !setup.askKey && !setup.busy
      return (
        <Box flexDirection="column" gap={1}>
          {setup.busy && <Text dimColor>{setup.busy}</Text>}
          {setup.error && <Text color="red">{setup.error}</Text>}
          {setup.done && st && (
            <Box flexDirection="column" gap={1}>
              <Text><Text color="green">● </Text>Connected to Honcho as {st.peer} in {st.workspace}.</Text>
              <Text dimColor>{st.auth}. Memory loads from your next session (/clear or restart Claude Code).</Text>
              {st.transcripts > 0 && (
                <Text dimColor>You have {st.transcripts} past sessions from the last 30 days. Run /honcho import to add them.</Text>
              )}
              <Button key="done" label="done" onPress={() => { setup = undefined; void openPane($) }} />
            </Box>
          )}
          {choosing && (
            <Box flexDirection="column" gap={1}>
              <Text>Connect Claude Code to Honcho so it remembers you across sessions.</Text>
              <Box flexDirection="row" gap={2}>
                {st.canSignIn && <Button key="signin" variant="primary" label="Sign in with your browser" onPress={() => void signIn($)} />}
                <Button key="apikey" label="Use an API key" onPress={() => void askForKey($)} />
              </Box>
            </Box>
          )}
          {setup.signIn && (
            <Box flexDirection="column" gap={1}>
              <Text>Approve the sign-in in your browser. Check the code matches: <Text weight="semibold">{setup.signIn.code}</Text></Text>
              <Box flexDirection="row" gap={2}>
                <Button key="open" label="open sign-in page ↗" onPress={() => void openUrl($, setup!.signIn!.url)} />
                <Button key="cancel" label="cancel" onPress={() => setSetup($, { state: st })} />
              </Box>
              <Text dimColor>Waiting for approval…</Text>
            </Box>
          )}
          {setup.askName && st && !setup.busy && (
            <Box flexDirection="column" gap={1}>
              <Text><Text color="green">● </Text>Connected. What should Honcho call you?</Text>
              <Input key="name" label="Your name in Honcho" value={st.suggestedName} submitLabel="save" autoFocus onSubmit={(v) => void saveName($, v)} />
              {st.others.length > 0 && <Text dimColor>Your other Honcho plugins: {otherNames(st.others)}</Text>}
              <Text dimColor>Use the same name everywhere you use Honcho, so it builds one picture of you.</Text>
            </Box>
          )}
          {setup.askKey && !setup.busy && (
            <Box flexDirection="column" gap={1}>
              <Input key="key" label="API key" placeholder="from app.honcho.dev" submitLabel="save" autoFocus onSubmit={(v) => void saveKey($, v)} />
              <Text dimColor>Get a key at app.honcho.dev. It is checked, then saved to ~/.honcho/config.json.</Text>
              <Button key="cancel" label="cancel" onPress={() => setSetup($, { state: st })} />
            </Box>
          )}
        </Box>
      )
    }

    if (cardOpen && overview.data) {
      const card = overview.data.card
      return (
        <Box flexDirection="column" gap={1}>
          <Button label="← back" onPress={back} />
          <Text weight="semibold">Peer card ({card.length})</Text>
          <Box flexDirection="column">
            {card.map((line) => <Text wrap="wrap">{line}</Text>)}
          </Box>
        </Box>
      )
    }

    if (detail) {
      const run = detail.run
      return (
        <Box flexDirection="column" gap={1}>
          <Button label="← back" onPress={back} />
          {detail.loading && <Text dimColor>Loading run…</Text>}
          {detail.error && <Text color="red">{detail.error}</Text>}
          {run && (
            <Box flexDirection="column" gap={1}>
              <Text>
                <Text color={COLOR[run.status]}>{GLYPH[run.status]} {run.status}</Text>
                <Text dimColor>  {run.trigger_reason} · {run.observer_id} → {run.observed_id} · {ago(run.started_at)}</Text>
              </Text>
              {run.pruned_at && <Text dimColor>Pruned {ago(run.pruned_at)}: only conclusions that still exist are kept.</Text>}
              <Box flexDirection="column">
                <Text weight="semibold">Created ({run.created.length})</Text>
                {run.created.length === 0 && <Text dimColor>none</Text>}
                {run.created.map((c) => (
                  <Text dimColor={c.conclusion.status !== 'current'}>
                    + {clip(c.conclusion.content, width - 4)}
                    {c.conclusion.status === 'removed' ? ` (removed later)` : ''}
                  </Text>
                ))}
              </Box>
              <Box flexDirection="column">
                <Text weight="semibold">Removed ({run.removed.length})</Text>
                {run.removed.length === 0 && <Text dimColor>none</Text>}
                {run.removed.map((r) => <Text color="red">- {clip(r.content, width - 4)}</Text>)}
              </Box>
              {run.peer_card && (
                <Box flexDirection="column">
                  <Text weight="semibold">Peer card {run.peer_card.before ? 'updated' : 'created'}</Text>
                  {(run.peer_card.after ?? [])
                    .filter((line) => !(run.peer_card?.before ?? []).includes(line))
                    .map((line) => <Text color="green">+ {clip(line, width - 4)}</Text>)}
                  {(run.peer_card.before ?? [])
                    .filter((line) => !(run.peer_card?.after ?? []).includes(line))
                    .map((line) => <Text color="red">- {clip(line, width - 4)}</Text>)}
                </Box>
              )}
            </Box>
          )}
        </Box>
      )
    }

    const o = overview.data
    const Section = ({ title, children }: { title: string; children?: RenderChildren }) => (
      <Box flexDirection="column">
        <Text weight="semibold">{title}</Text>
        {children}
      </Box>
    )
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1}>
          <Text dimColor>
            {dreams.peer ?? '…'} @ {dreams.workspace ?? '…'}
            {dreams.at ? ` · updated ${ago(new Date(dreams.at).toISOString())}` : ''}
          </Text>
          {o?.sessionUrl && <Button key="open" label="open in Honcho" plain onPress={(press) => void openSession($, o.sessionUrl!, press)} />}
          <Button key="refresh" label="refresh" plain onPress={() => void loadAll($)} />
        </Box>
        {overview.error && <Text color="red">{overview.error}</Text>}
        {overview.loading && !o && <Text dimColor>Loading…</Text>}
        <Section title="Dreams">
          {dreams.loading && dreams.runs.length === 0 && <Text dimColor>Loading dreams…</Text>}
          {dreams.error && <Text color="red">{dreams.error}</Text>}
          {!dreams.loading && !dreams.error && dreams.runs.length === 0 && <Text dimColor>No dreams yet.</Text>}
          {dreams.runs.slice(0, 5).map((run) => (
            <Button key={run.id} label={`${run.status} ${run.id}`} onPress={() => void loadDetail($, run.id)}>
              <Text color={COLOR[run.status]}>{GLYPH[run.status]} </Text>
              {`${ago(run.started_at).padEnd(8)} +${run.created_count} −${run.removed_count}${run.peer_card_updated ? ' card' : ''}  `}
              <Text dimColor>{run.trigger_reason}</Text>
            </Button>
          ))}
        </Section>
        {o && (
          <Section title="Peer card">
            {o.card.length === 0 && <Text dimColor>Empty so far; it fills in as Honcho learns about you.</Text>}
            {o.card.length > 0 && (
              <Button key="card" label={`peer card, ${o.card.length} items`} onPress={() => { cardOpen = true; $.ui.invalidate('ui.render') }}>
                {`${o.card.length} items  `}
                <Text dimColor>{clip(o.card[0], width - 16)}</Text>
              </Button>
            )}
          </Section>
        )}
      </Box>
    )
  })
}
