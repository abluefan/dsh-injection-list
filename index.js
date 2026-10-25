/**
 * dsh-injection-list —— 记录每个会话收到的上下文注入，供 client 半边展示。
 *
 * 0.2.1 的 UI 不渲染 context 行，client 侧也拿不到会话事件；这里在 Host 的
 * `agent/pre-step` 链尾（next() 之后）看 decision.messages 里 source.kind
 * 不是 `user` 的消息，按 session 记下来，再通过 HTTP 提供给 client 半边。
 *
 * 只读、只记录，不改任何会话数据。
 *
 * 功能开关（全部默认 true，见 cordis.patch.yml 的 config）：
 *   hostRecord     记录注入并暴露 /injection-list/api/*（关掉则 client 全部无数据）
 *   headerButton   会话页头的「注入 N」按钮
 *   turnTailList   每回合尾部的注入行
 *   chatNodes      把注入渲染成消息流里的 context 节点（复用官方 context 渲染器）
 *
 * @module dsh-injection-list
 */
export const name = 'dsh-injection-list'

/**
 * 统一探针开关（与 client 半边的 DEBUG 保持一致语义）。
 * false = 只打启动就绪与错误；true = 额外打印 client 清单诊断。
 */
const DEBUG = false

/** 探针日志：仅 DEBUG 打开时打印。 */
function probe(...args) {
  if (DEBUG) console.log('[dsh-injection-list][probe]', ...args)
}

/** 需要 webServer 注册路由。 */
export const inject = ['webServer']

/** sessionId → 注入记录（最新的在后）。 */
const RECORDS = new Map()

/** 每个会话最多保留多少条。 */
const MAX_RECORDS = 200

/** 功能开关默认值：全开，与改造前行为一致。 */
const DEFAULT_FLAGS = {
  hostRecord: true,
  headerButton: true,
  turnTailList: true,
  chatNodes: true,
}

function flag(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function textOf(message) {
  const content = message?.content
  if (!Array.isArray(content)) return ''
  return content
    .map(block => (block && typeof block.text === 'string' ? block.text : ''))
    .filter(Boolean)
    .join('\n')
}

function labelOf(source) {
  if (!source || typeof source !== 'object') return 'context'
  const changes = Array.isArray(source.changes) ? source.changes : []
  const paths = changes
    .map(change => (change && typeof change.path === 'string' ? change.path : ''))
    .filter(Boolean)
  if (paths.length > 0) return paths.join(', ')
  if (typeof source.plugin === 'string' && source.plugin.length > 0) return source.plugin
  if (typeof source.kind === 'string' && source.kind.length > 0) return source.kind
  return 'context'
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(text)
}

export function apply(ctx, config) {
  const raw = config && typeof config === 'object' ? config : {}
  const flags = {
    hostRecord: flag(raw.hostRecord, DEFAULT_FLAGS.hostRecord),
    headerButton: flag(raw.headerButton, DEFAULT_FLAGS.headerButton),
    turnTailList: flag(raw.turnTailList, DEFAULT_FLAGS.turnTailList),
    chatNodes: flag(raw.chatNodes, DEFAULT_FLAGS.chatNodes),
  }

  // 页头 / 回合尾 / 消息流节点都是由 client 半边渲染的，但数据只能由 Host 记录。
  // 关掉 hostRecord 时，连 HTTP 都不挂 —— client 那三件自然拿不到东西。
  if (flags.hostRecord) {
    // prepend：跑到 waterfall 最前面，next() 会跑完整条链（包括后面 live-docs /
    // time-context 的注入），这样才能看到本轮所有 context 消息。
    ctx.on('agent/pre-step', async ({ agent, turn, step }, next) => {
      const decision = await next()
      try {
        const sessionId = agent?.session?.id
        const messages = decision?.messages
        if (sessionId !== undefined && Array.isArray(messages)) {
          const list = RECORDS.get(sessionId) ?? []
          for (const message of messages) {
            const source = message?.source
            const kind = source && typeof source.kind === 'string' ? source.kind : undefined
            if (kind === undefined || kind === 'user') continue
            list.push({
              kind,
              label: labelOf(source),
              text: textOf(message).slice(0, 4000),
              turn: typeof turn === 'number' ? turn : undefined,
              step: typeof step === 'number' ? step : undefined,
              time: Date.now(),
            })
          }
          while (list.length > MAX_RECORDS) list.shift()
          RECORDS.set(sessionId, list)
        }
      } catch (error) {
        console.warn('[dsh-injection-list] record failed:', (error && error.message) || error)
      }
      return decision
    }, { prepend: true })

    ctx.webServer.register({
      kind: 'prefix',
      path: '/injection-list',
      handler: async (req, res) => {
        try {
          const url = new URL(req.url || '/', 'http://localhost')
          if (url.pathname === '/injection-list/api/list') {
            const session = url.searchParams.get('session') || ''
            return sendJson(res, 200, { session, items: RECORDS.get(session) ?? [] })
          }
          // client 半边在 apply 时拉一次，决定注册哪几件。
          if (url.pathname === '/injection-list/api/flags') {
            return sendJson(res, 200, { flags })
          }
          // 诊断通道：client 侧把关键事件回传到 Host stdout，省去开 DevTools。
          if (url.pathname === '/injection-list/api/log') {
            const message = url.searchParams.get('msg') || ''
            console.log('[dsh-injection-list][client]', message.slice(0, 500))
            return sendJson(res, 200, { ok: true })
          }
          return sendJson(res, 404, { error: 'not found' })
        } catch (error) {
          return sendJson(res, 500, { error: String((error && error.message) || error) })
        }
      },
    })
  }

  // 诊断：本包是否进入最终 boot graph（composed）。
  try {
    const clientModules = ctx.get('clientModules')
    if (clientModules === undefined) {
      console.log('[dsh-injection-list] clientModules service MISSING')
    } else {
      const composed = clientModules.composed
      const describe = (value) => {
        if (value === undefined || value === null) return 'undefined'
        if (Array.isArray(value)) return 'array(' + value.length + ')'
        if (typeof value === 'object') return 'object{' + Object.keys(value).slice(0, 12).join(',') + '}'
        return typeof value
      }
      probe('composed = ' + describe(composed))
      let json = ''
      try {
        json = JSON.stringify(composed)
      } catch (error) {
        json = '(not serializable: ' + String((error && error.message) || error) + ')'
      }
      const at = json.indexOf('injection')
      probe('composed contains injection: ' + String(at >= 0)
        + (at >= 0 ? ' @' + at : '')
        + ' | size=' + json.length)
    }
  } catch (error) {
    probe('composed probe failed: ' + String((error && error.stack) || error).slice(0, 400))
  }

  console.log(
    '[dsh-injection-list] host ready',
    'flags=' + JSON.stringify(flags),
  )
}
