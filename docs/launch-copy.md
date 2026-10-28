# AFTER YOU：发布文案与 15 秒实机演示

状态：待正式试玩地址与源码地址核验的草稿；未代为发布。玩法依据 `design-spec.md`：收集光点、留下回声、冲刺穿过回声。下列文案不含用户数、榜单、独创首发或万星宣称。

发布前用真实地址替换 `{{PLAY_URL}}`、`{{REPO_URL}}`、`{{REPLAY_DOC_URL}}`。凡实机尚不能证明的功能句，删除后再发；不要将模板变量原样发出。最终文案应与所录版本一致。

## 玩家向：英文短帖

Your past self has become your next target.

AFTER YOU is a 60-second browser arcade game. Collect light, leave echoes of your movement, then dash through them to score.

Play a round: {{PLAY_URL}}

随帖使用下方实机短片。只有挑战链接已验收，才可加：“Same seed. Your turn. Send a challenge to a friend.”

## 玩家向：中文短帖

刚才的你，成了现在的目标。

AFTER YOU 是一个每局60秒的网页小游戏：收集光点，留下重复你动作的回声，再冲刺穿过它们得分。

来一局：{{PLAY_URL}}

挑战链接已验收后可加：“同一局挑战，换你试试。把这局挑战发给朋友。”

## 开发者向：英文

**AFTER YOU — a small arcade game built around replayable movement**

Collect light. Leave an echo. Dash through your past.

The game runs in the browser. The source includes a fixed-step simulation and deterministic input replay, with tests for repeating the same run. The runtime has no third-party JavaScript dependencies, and the game rules can be changed locally.

Try it: {{PLAY_URL}}
Read and run the code: {{REPO_URL}}
Replay implementation and tests: {{REPLAY_DOC_URL}}

I'd like feedback on the first round: when did the echo-and-dash mechanic become clear? If you find a replay mismatch, please include the rules version and the saved run.

使用条件：固定步进、确定性测试、导出回放及对应文档均已验收。某项未实现时删除该项，不能将路线图写成现有功能。

## 开发者向：中文

**AFTER YOU：把动作回放做成一个60秒游戏**

收集光点，留下回声，冲刺穿过刚才的自己。

源码包含固定步进模拟、输入回放和验证同一局结果的测试。游戏运行时没有第三方JavaScript依赖，可以在本地修改规则，观察难度和节奏怎样变化。

试玩：{{PLAY_URL}}
源码与运行方式：{{REPO_URL}}
回放实现与测试：{{REPLAY_DOC_URL}}

想听听你的首局感受：你在什么时候看懂了“留下回声，再冲刺穿过它”？遇到回放不一致，可以附规则版本和保存的回放一起提issue。

## Show HN 候选稿

仅当项目已具备可讨论的实际技术与设计投入、可以直接试玩，且发布者能亲自回答问题时使用。先核对[当前规则](https://news.ycombinator.com/showhn.html)。不把AI生成速度或“几分钟做完”作为展示理由。

标题：

> Show HN: After You, a 60-second browser game where you dash through your past

首条说明：

> AFTER YOU starts with collecting light. Your movement leaves echoes, and dashing through those echoes earns points. The same path becomes both a problem and an opportunity on the next pass.
>
> Play: {{PLAY_URL}}
> Source: {{REPO_URL}}
>
> The implementation uses a fixed-step simulation and recorded input for deterministic replays. Rules are kept small enough to modify and test locally, without third-party runtime JavaScript dependencies.
>
> I'm looking for feedback on whether the first round communicates the mechanic, and whether replaying your own movement stays interesting after a few rounds. The replay notes and tests are here: {{REPLAY_DOC_URL}}.

发布者须实际参与制作并能回答实现问题；实现句同样受发布验收约束。

## itch.io 页面候选稿

**Short description**

Collect light, leave echoes, and dash through your past in a 60-second arcade game.

**Description**

Every path you take becomes something to deal with later. Collect light to build your score, then dash through the echoes you leave behind.

A round lasts up to 60 seconds. Try again, change your route, and see what happens when your past catches up.

Play: {{PLAY_URL}}
Source and contribution notes: {{REPO_URL}}

操作说明从正式版本界面逐项抄录；不要凭模板写按键。设备标签、每日挑战、本地最好成绩与回放能力只列验收过的功能。封面和截图使用真实游戏画面；概念图不能标为实机截图。

## 15 秒实机演示脚本

目标：即使静音，也能看懂“过去的轨迹变成现在的目标”。先录完整真实一局，再剪辑；不改分数、计时器、命中反馈或回声数量。剪接允许，字幕不制造连续实时的错觉。

| 时间 | 实机画面 | 英文字幕 | 中文字幕 |
| --- | --- | --- | --- |
| 0–2秒 | 角色经过两三个光点，保留真实得分反馈 | Collect light. | 收集光点。 |
| 2–5秒 | 展示第一道回声沿刚才路径移动；稍留空隙让观众认出轨迹 | Leave an echo. | 留下刚才的自己。 |
| 5–8秒 | 角色冲刺穿过一道回声，清楚显示命中、消散与实际分数变化 | Dash through your past. | 冲刺，穿过你的过去。 |
| 8–12秒 | 切到同一局后段的一次真实连贯操作；多个回声可见但不遮挡角色 | Your route becomes your next move. | 上一条路线，下一次机会。 |
| 12–15秒 | 切到真实结束画面，再展示标题与可读试玩域名 | AFTER YOU · Play a round | AFTER YOU · 来一局 |

导出横版与竖版时重新安排字幕，不裁掉玩家、冲刺反馈、生命或真实计时器。最后三秒只保留一个试玩入口，GitHub放在正文或结束页开发者入口。声音采用实际游戏音效；静音也须可读。若只能录到基本操作，先发基本操作，不合成未实现玩法。

## 真实更新与贡献邀请模板

英文：

> Updated AFTER YOU: {{VERIFIED_CHANGE}}. Here's the same recorded run before and after the change. {{EVIDENCE_LINK}}
>
> Try it: {{PLAY_URL}}
> Feedback I'm checking next: {{ONE_SPECIFIC_QUESTION}}

中文：

> AFTER YOU 更新：{{已验证的改动}}。这里是同一段回放的前后对比：{{证据链接}}。
>
> 试玩：{{PLAY_URL}}
> 这一轮重点想了解：{{一个具体问题}}。

仅在确有贡献入口时追加：“欢迎提供可复现的回放问题、规则变体或本地化改进。每项任务的范围和验收条件见仓库。”收藏请求可选：“如果游戏或回放实现对你有用，可以在 GitHub 收藏。”不要求转发、投票或star换奖励。
