# dsh-injection-list

在会话界面显示「本轮上下文注入了什么」（live-docs / time-context / agent-instructions …），补 0.2.1 UI 把 context 行折叠掉的缺口。

## 原理

0.2.1 的 UI 不渲染 context 行，client 侧也拿不到会话事件。所以：

Host 半边挂在 `agent/pre-step` 链尾（`next()` 之后），检查 `decision.messages` 里 `source.kind` 不是 `user` 的消息，按 session 记下来，再通过 HTTP 提供给 client 半边。

**只读、只记录，不改任何会话数据。**

每个会话最多保留 200 条记录。

## 四种显示（各自独立开关）

| 开关 | 默认 | 作用 |
|---|---|---|
| `hostRecord` | `true` | 记录注入 + 暴露 `/injection-list/api/*`（关掉则下面三件都没数据） |
| `headerButton` | `true` | 会话页头的「注入 N」按钮 |
| `turnTailList` | `true` | 每回合尾部的注入行 |
| `chatNodes` | `true` | 消息流里的上下文节点（复用官方 context 渲染器） |

## 安装

### ① 通过插件市场（推荐）

在 [awesome-dsh-plugin](https://awesome-dsh-plugin.com) 的目录里找到本插件，
或在 dsh 的 **插件 → 发现** 里搜索 `dsh-injection-list`，点安装。

### ② 手动安装

任选一种，**不要两种同时用**：

**A. 复制 + 手写 insert（适合本地开发）**

1. 把本目录复制到 `$DSH_HOME/profiles/web/node_modules/dsh-injection-list/`
2. 在 `$DSH_HOME/profiles/web/cordis.patch.yml` 加：

   ```yaml
   - insert:
       - id: injection-list
         name: 'dsh-injection-list'
   ```

3. 重启 dsh，或让 Loader 重载配置

**B. `dsh plugin add`（需要包已发布到 npm）**

```sh
dsh plugin --profile web add dsh-injection-list
```

> ⚠ 用 B 之后，包名会进 `dsh.profile.bundles`，bundles 层会读本包自带的
> `cordis.patch.yml`；此时**不要**再做 A 的第 2 步 —— 同一个 id 会被插两次，
> DSH 启动会直接失败。

## 日志

`DEBUG` 常量（`index.js` 顶部）默认 `false` —— 只打启动就绪与错误。
改成 `true` 会额外打印 client 清单诊断。

## 环境

- DSH ≥ 0.2.1
