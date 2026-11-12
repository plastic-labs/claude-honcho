import { expect, test } from 'claude-code/testing'

// The test stands for the engine: it keeps the record of open panes that
// `$.ui.panes()` reads, so the plugin can only learn the pane's state from it.
function engine(on: Parameters<Parameters<typeof test>[1]>[1], open: Set<string>) {
  on('ui.open', (_, e) => {
    open.add(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    open.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: [...open].map((id) => ({
      id, title: 'Honcho', isShown: true, isFocused: false, isPlaced: true,
    })),
  }))
  on('command.register', () => ({ value: { command: 'honcho' } }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '{"ok":true,"items":[]}', stderr: '' } }))
  on('fs.exists', () => ({ value: false }))
  on('env.get', () => ({ value: '/home/test' }))
  on('env.set', () => ({ value: undefined }))
  on('session.id', () => ({ value: 'session-1' }))
  on('clock.every', () => ({ value: undefined }))
}

const honcho = ($: Parameters<Parameters<typeof test>[1]>[0]) =>
  $.command.run({ command: 'honcho', args: '' })

test('/honcho toggles by the pane the engine has open', async ($, on) => {
  const open = new Set<string>()
  engine(on, open)

  expect((await honcho($))?.text).toBe('Honcho pane opened.')
  expect([...open]).toEqual(['honcho'])

  expect((await honcho($))?.text).toBe('Honcho pane closed.')
  expect([...open]).toEqual([])
})

test('closed from the status bar, /honcho opens it again', async ($, on) => {
  const open = new Set<string>()
  engine(on, open)

  await honcho($)
  for (const surface of ['terminal', 'desktop'] as const) {
    if (open.size === 0) break
    const bar = await $.ui.mount({
      plugin: 'honcho', component: 'SessionMode', surface, props: { modes: [] },
    })
    await bar.press({ key: 'honcho' })
    await bar.unmount()
  }
  expect([...open]).toEqual([])

  expect((await honcho($))?.text).toBe('Honcho pane opened.')
  expect([...open]).toEqual(['honcho'])
})

test('a pane left up across a reload closes on the first /honcho', async ($, on) => {
  // A reload resets the module, but the engine keeps the pane up.
  const open = new Set<string>(['honcho'])
  engine(on, open)

  expect((await honcho($))?.text).toBe('Honcho pane closed.')
  expect([...open]).toEqual([])
})
