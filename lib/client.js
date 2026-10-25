// dsh-injection-list client half —— 极简版（2026-10-19 重写）
//
// 只做三件事：
//   1) 页头「注入 N」按钮（数据来自 Host 的 /injection-list/api/list）
//   2) 一条 ConversationNodeDefinition：把非 user 来源的 user/message 变成
//      kind='injection' 的 Chat 节点
//   3) 该节点对应的 keyed 渲染器（朴素折叠行，不加任何装饰）
//
// 刻意不做：shortLabel / 图标 / 官方 DisclosureRow / 多行拆分 / 探针 / exclusive。
// 先确认「目标节点机制在极简实现下能工作」，再逐层加回装饰。
window.__ModuleLoader__.load({
  id: 'dsh-injection-list',
  factory: (require) => {
    /**
     * 统一探针开关。
     * false = 只上报错误（apply FAILED / primitives 失败），其余静默；
     * true  = 打印 factory / apply / definition / match / start / buildViewNode / render 全链路。
     */
    const DEBUG = false

    /** 回传到 Host stdout 的日志通道（console.log 只在浏览器控制台）。 */
    function report(message) {
      try {
        fetch('/injection-list/api/log?msg=' + encodeURIComponent(String(message))).catch(() => {})
      } catch { /* 忽略 */ }
    }

    /** 探针：仅在 DEBUG 打开时上报。 */
    function probe(message) {
      if (!DEBUG) return
      report(message)
    }

    console.log('[dsh-injection-list] factory called (module loaded)')
    probe('factory called')
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const h = React.createElement

    const muted = 'rgba(127,127,127,0.9)'

    // 官方 UI primitives 在 PLATFORM_MODULES（baseline 隐式可用）。
    // ⚠ 不能用 typeof === 'function'：DisclosureRow 是 memo() 包装，typeof 为 'object'。
    let primitives = null
    try {
      const raw = require('@deepseek-ai/dsh-client-ui-primitives')
      for (const candidate of [raw, raw && raw.default]) {
        if (candidate && candidate.DisclosureRow !== undefined) { primitives = candidate; break }
      }
    } catch (error) {
      report('ui-primitives require failed: ' + String((error && error.message) || error))
    }

    /** 每个注入来源配一个对应语义的官方图标。 */
    const ICON_BY_KIND = {
      'time-context': 'IconClockOutlineRegular',
      'live-docs': 'IconDeliverDocRegular',
      'agent-instructions': 'IconListPenOutlineRegular',
      'runtime-context': 'IconSlidersTwoOutlineRegular',
      'skill-catalog': 'IconSkillOutlineRegular',
    }
    const FALLBACK_ICON = 'IconContextInjectionOutlineRegular'

    function iconFor(kind) {
      if (!primitives) return null
      const Icon = primitives[ICON_BY_KIND[kind] || FALLBACK_ICON] || primitives[FALLBACK_ICON]
      return Icon !== undefined ? h(Icon, { size: 14 }) : null
    }

    /** 页头「注入 N」按钮。 */
    function InjectionList(props) {
      const sessionId = props && props.sessionId
      const [items, setItems] = React.useState([])
      const [open, setOpen] = React.useState(false)
      React.useEffect(() => {
        if (!sessionId) return undefined
        let alive = true
        const load = () => {
          fetch('/injection-list/api/list?session=' + encodeURIComponent(sessionId))
            .then(response => response.json())
            .then(data => {
              if (!alive) return
              setItems(Array.isArray(data && data.items) ? data.items : [])
            })
            .catch(() => {})
        }
        load()
        const timer = setInterval(load, 3000)
        return () => { alive = false; clearInterval(timer) }
      }, [sessionId])
      if (!sessionId || items.length === 0) return null
      return h('div', { style: { position: 'relative', display: 'inline-flex' } }, [
        h('button', {
          key: 'btn',
          type: 'button',
          onClick: () => setOpen(value => !value),
          style: {
            fontSize: '12px', padding: '2px 8px', borderRadius: '6px',
            border: '1px solid rgba(127,127,127,0.22)', background: 'transparent',
            color: 'inherit', cursor: 'pointer',
          },
        }, '注入 ' + items.length),
        open ? h('div', {
          key: 'panel',
          style: {
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
            width: '420px', maxHeight: '55vh', overflowY: 'auto', padding: '8px',
            borderRadius: '8px', border: '1px solid rgba(127,127,127,0.22)',
            background: 'var(--dsw-alias-bg-layer-1, rgba(20,20,22,0.96))',
          },
        }, items.slice(-40).reverse().map((item, index) => h('div', {
          key: String(index),
          style: { fontSize: '12px', padding: '2px 0', color: muted },
        }, '· ' + String(item.label || item.kind || 'context')))) : null,
      ])
    }

    /** 取路径最后一段。 */
    function baseName(path) {
      const parts = String(path || '').split(/[\\/]/)
      return parts[parts.length - 1] || String(path || '')
    }

    /** 单行：官方 DisclosureRow（拿不到时回退纯文字）。 */
    function InjectionRow(props) {
      const [open, setOpen] = React.useState(false)
      const toggle = React.useCallback(() => { setOpen(value => !value) }, [])
      const label = String(props.label || 'context')
      const text = String(props.text || '')
      const body = open ? h('pre', {
        key: 'p',
        style: {
          margin: '2px 0 6px', padding: '6px', fontSize: '11px',
          whiteSpace: 'pre-wrap', wordBreak: 'break-around', maxHeight: '240px',
          overflowY: 'auto', borderRadius: '6px', background: 'rgba(127,127,127,0.10)',
        },
      }, text.slice(0, 1500)) : null

      const DisclosureRow = primitives && primitives.DisclosureRow
      if (DisclosureRow !== undefined) {
        return h(DisclosureRow, {
          icon: iconFor(props.kind),
          title: label,
          open,
          expandable: true,
          expandOnRowClick: true,
          keepContentWhenOpen: true,
          previewChevron: true,
          onToggle: toggle,
        }, body)
      }
      return h('div', { style: { fontSize: '12px', color: muted, margin: '2px 0' } }, [
        h('button', {
          key: 'b', type: 'button', onClick: toggle,
          style: { background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '12px', padding: 0, textAlign: 'left' },
        }, (open ? '▾ ' : '▸ ') + label),
        body,
      ])
    }

    /** 消息流里的注入节点：live-docs 每个文档单独一行。 */
    /** 消息流里的注入节点：live-docs 多份时每份一行，否则单行。 */
    function InjectionNodeView(props) {
      const data = props && props.node && props.node.data
      probe('render ' + String(data && data.label))
      if (!data) return null
      const sections = Array.isArray(data.sections) ? data.sections : []
      if (data.sourceKind === 'live-docs' && sections.length > 1) {
        probe('render multi sections=' + sections.length)
        return h('div', null, sections.map((section, index) => h(InjectionRow, {
          key: String(index),
          label: baseName(section.name),
          text: section.text,
          kind: data.sourceKind,
        })))
      }
      return h(InjectionRow, {
        label: data.label,
        text: data.text,
        kind: data.sourceKind,
      })
    }

    function makeDefinition() {
      return {
        kind: 'injection',
        target: 'chat',
        match(event) {
          if (!event || event.type !== 'user/message') return null
          const source = (event.data && event.data.source) || {}
          if (typeof source.kind !== 'string' || source.kind === 'user') return null
          probe('match ' + source.kind + ' seq=' + event.seq)
          return { id: String(event.data.id), role: 'start' }
        },
        start(_context, match) {
          const event = match.event
          const source = (event.data && event.data.source) || {}
          const content = Array.isArray(event.data.content) ? event.data.content : []
          const text = content
            .map(block => (block && typeof block.text === 'string' ? block.text : ''))
            .filter(Boolean)
            .join('\n')
          const changes = Array.isArray(source.changes) ? source.changes : []
          // 只有一份变更时直接显示文件名（增量更新最常见）；多份才显示数量。
          const nameOf = (value) => {
            const parts = String((value && value.path) || '').split(/[\\/]/)
            return parts[parts.length - 1] || ''
          }
          let label
          if (source.kind === 'live-docs') {
            if (changes.length === 1) {
              const only = nameOf(changes[0])
              const action = changes[0] && changes[0].action === 'remove' ? '已移除 ' : ''
              label = 'live-docs · ' + action + (only || '1 个文件')
            } else {
              label = 'live-docs · ' + changes.length + ' 个文件'
            }
          } else {
            label = String(source.kind)
          }
          const sections = Array.isArray(source.sections) ? source.sections : []
          probe('start ' + label + ' sections=' + sections.length)
          return {
            kind: 'injection',
            seq: event.seq,
            label,
            text,
            sourceKind: String(source.kind),
            sections: sections.map(section => ({
              name: String((section && section.name) || ''),
              text: String((section && section.text) || ''),
            })),
          }
        },
        update(context) {
          return context.state
        },
        buildViewNode(context) {
          const state = context.state
          if (!state) return null
          probe('buildViewNode ' + state.label)
          return {
            key: context.key,
            kind: 'injection',
            id: context.id,
            target: 'chat',
            anchorSeq: state.seq,
            location: (context.start && context.start.location) || { kind: 'unresolved' },
            visibility: 'visible',
            groupTree: 'turn',
            data: state,
          }
        },
      }
    }

    const inject = ['slots', 'uiConversation']

    /** 插件入口（同步）。 */
    function apply(ctx) {
      console.log('[dsh-injection-list] apply entered (minimal)')
      probe('apply entered')
      try {
        applyInner(ctx)
        console.log('[dsh-injection-list] client ready (minimal)')
        probe('client ready')
      } catch (error) {
        console.log('[dsh-injection-list] apply FAILED: ' + String((error && error.stack) || error).slice(0, 500))
        report('apply FAILED: ' + String((error && error.stack) || error).slice(0, 400))
      }
    }

    function applyInner(ctx) {
      const slots = ctx.get('slots')
      if (slots !== undefined) {
        slots.inject('conversation.session.header.utilities', () => slots.register({
          name: 'conversation.session.header.utilities',
          id: 'injection-list',
          order: 10,
        }, InjectionList))
      }

      const uiConversation = ctx.uiConversation
      console.log('[dsh-injection-list] uiConversation = ' + String(uiConversation === undefined ? 'MISSING' : 'OK'))
      probe('uiConversation = ' + (uiConversation === undefined ? 'MISSING' : 'OK'))
      if (uiConversation !== undefined && uiConversation.events !== undefined) {
        uiConversation.events.register(makeDefinition())
        console.log('[dsh-injection-list] definition registered')
        probe('definition registered')
      }

      if (slots !== undefined) {
        slots.inject('conversation.chat.node', () => slots.register({
          name: 'conversation.chat.node',
          key: 'injection',
        }, InjectionNodeView))
      }

    }

    exports.name = 'dsh-injection-list'
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
