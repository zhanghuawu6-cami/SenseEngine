# SenseEngine State Loop Demo 设计规格

**日期：** 2026-07-15
**状态：** 已批准
**适用系统：** SenseEngine 最终集成与演示

## 1. 目标

在不修改 `src/` 下任何代码的前提下，创建一个可直接运行的单文件演示，串联现有的：

- `StateEstimator`
- `StateMemoryBank`
- `InterventionPolicy`

演示文件内定义 `StateEvent`、`StatePerceptor` 和 `RealTimeClock` 作为模拟世界与核心契约之间的适配层，并实现顶层 `SenseEngine` 单次处理循环。

`StateValidator` 明确不在本轮范围内。

## 2. 范围

### 2.1 本轮包含

- `examples/state_loop_demo.py`。
- 演示专用事件、感知器、时钟和运行轨迹类型。
- `SenseEngine.run_once(event) -> Intervention`。
- 写入前历史基线计算。
- Ask、Suggest Break、Silence 三种稳定可复现的演示场景。
- JSON 格式输入、状态估计和干预日志。
- 集成测试、端到端子进程运行测试、mypy 和 Ruff。

### 2.2 本轮不包含

- 修改 `src/` 下的适配器、核心契约、估计器、记忆层或策略层。
- `StateValidator` 或其他评估模块。
- 持久化、API、UI、真实通知或动作执行。
- 将演示专用适配类声明为生产核心组件。

## 3. 文件边界

```text
SenseEngine/
├── examples/
│   └── state_loop_demo.py
└── tests/
    └── examples/
        └── test_state_loop_demo.py
```

功能差异必须仅位于 `examples/` 和 `tests/examples/`。`src/` 通过 Git 差异审计证明为零修改。

## 4. 演示适配层

### 4.1 StateEvent

`StateEvent` 是冻结、带 slots 的 dataclass：

```python
ContextEvidenceValue = str | float | int | bool | None


@dataclass(frozen=True, slots=True)
class StateEvent:
    scenario_description: str
    computer_activity: str
    context_evidence: dict[str, ContextEvidenceValue]
```

`computer_activity` 支持四个演示预设：

| 预设 | typing_speed | mouse_movement_frequency | 用途 |
| --- | --- | --- | --- |
| `unknown` | 不生成信号 | 不生成信号 | 触发低置信度 Ask |
| `neutral` | `Moderate` | `Moderate` | 作为中性电脑活动 |
| `flow` | `High` | `Low` | 触发 Flow 估计，策略保持 Silence |
| `friction` | `Low` | `High` | 展示 Friction 输入映射能力 |

### 4.2 RealTimeClock

`RealTimeClock` 是一个可调用对象：

```python
class RealTimeClock:
    def __call__(self) -> datetime:
        return datetime.now(tz=UTC)
```

主程序创建一个共享实例，注入 `StatePerceptor`、`StateMemoryBank` 和 `SenseEngine`，使信号、记忆和轨迹使用一致的 UTC 时间源。

### 4.3 StatePerceptor

`StatePerceptor` 构造器接受时钟，并实现：

```text
StatePerceptor.perceive(event: StateEvent)
    -> tuple[list[SignalEvent], ContextSnapshot]
```

处理流程：

1. 校验 `computer_activity` 预设。
2. 校验 `context_evidence["activity"]` 为字符串（如果存在）。
3. 校验 `context_evidence["meeting_minutes"]` 为非布尔的有限正数（如果存在）。
4. 读取一次时钟作为本次感知时间。
5. `unknown` 返回空信号列表；其他预设生成一个 `computer_activity_snapshot` 复合 `SignalEvent`。
6. 根据活动和会议时长生成 `ContextSnapshot`。会议的 `ends_at` 为感知时间，`starts_at` 为感知时间减去持续分钟。

演示信号使用固定声明式元数据：

- `SignalSource.adapter="state_loop_demo"`
- `SignalSource.device_id="demo-device"`
- `SignalSource.modality="computer_activity"`
- `SignalQuality.score=1.0`
- `SignalQuality.completeness=1.0`
- `ConsentScope.purposes=("state_estimation",)`
- `RetentionTier.SESSION`
- `ExpiryAction.DELETE`

## 5. SenseEngine 与运行轨迹

### 5.1 RunTrace

```python
@dataclass(frozen=True, slots=True)
class RunTrace:
    run_at: datetime
    baseline: float
    estimate: StateEstimate
```

`RunTrace` 只用于演示观测，不作为核心契约或业务输出。

### 5.2 构造器

```text
SenseEngine(
    perceptor: StatePerceptor,
    estimator: StateEstimator,
    memory_bank: StateMemoryBank,
    policy: InterventionPolicy,
    *,
    clock: Callable[[], datetime] | None = None,
)
```

前四个参数为已确认的四组件实例。可选时钟用于运行轨迹；未提供时使用新的 `RealTimeClock`。

`last_trace` 通过只读 property 暴露，类型为 `RunTrace | None`，首次运行前为 `None`。

### 5.3 run_once

```text
SenseEngine.run_once(event: StateEvent) -> Intervention
```

严格数据流：

1. `run_at = clock()`。
2. `signal_events, context = perceptor.perceive(event)`。
3. `estimate = estimator.estimate(signal_events, context)`。
4. `baseline = memory_bank.get_baseline()`，只包含先前历史。
5. `memory_bank.save_event(estimate)`。
6. `intervention = policy.decide_action(estimate, baseline)`。
7. 保存 `RunTrace(run_at, baseline, estimate)`。
8. 返回 `intervention`。

该顺序避免当前高负荷估计抬高自身参考基线，同时保持 Remember 在 Decide 之前完成。

## 6. 演示场景与输出

演示事件固定按以下顺序：

1. `unknown` 且无上下文：生成 Unknown 估计，`confidence=0.40`，返回 Ask，写入 `cognitive_load=0.50`。
2. `neutral` + `Meeting` + `meeting_minutes=90`：写入前基线为 `0.50`，生成 `cognitive_load=0.90`，返回 Suggest Break。
3. `flow` 且无上下文：写入前基线为 `(0.50 + 0.90) / 2 = 0.70`，生成 `cognitive_load=0.55`，返回 Silence。

`main()` 遍历事件并打印：

- 场景序号与描述。
- `StateEvent` 的 JSON 表达。
- `RunTrace.run_at` ISO 8601 时间。
- 写入前历史基线。
- `StateEstimate.model_dump(mode="json")` 的 JSON 表达。
- `Intervention.model_dump(mode="json")` 的 JSON 表达。

JSON 使用 `ensure_ascii=False` 和两空格缩进，保留中文理由并便于人类阅读。

## 7. 错误处理

- 不支持的 `computer_activity` 抛出 `ValueError`，错误信息包含坏值。
- `activity` 存在但不是字符串时抛出 `ValueError`。
- `meeting_minutes` 存在但是布尔值、非数值、非有限数或非正数时抛出 `ValueError`。
- 错误在适配层立即暴露，不将非法证据传递到核心估计器。
- `last_trace` 在首次调用前为 `None`，主程序只在 `run_once()` 成功后读取。

## 8. 测试与质量门禁

### 8.1 TDD 集成测试

1. 先创建 `tests/examples/test_state_loop_demo.py`，观测因演示模块不存在而 Red。
2. 使用可控假时钟构造四组件与 `SenseEngine`。
3. 顺序运行三个事件，断言动作为 Ask、Suggest Break、Silence。
4. 断言三次写入前历史基线为 `0.5`、`0.5`、`0.7`。
5. 断言 `last_trace.estimate` 与当次估计一致。
6. 分别验证未知电脑活动、非字符串活动、非法会议分钟的 `ValueError`。

### 8.2 端到端运行

测试使用 `sys.executable` 从项目根目录运行：

```bash
python examples/state_loop_demo.py
```

断言退出码为零，并且标准输出同时包含 `"Ask"`、`"Suggest Break"` 和 `"Silence"`。

本地验证使用项目虚拟环境的等价命令：

```bash
.venv/bin/python examples/state_loop_demo.py
```

### 8.3 静态与范围验证

- 完整 pytest 回归测试。
- mypy 显式检查 `examples/state_loop_demo.py` 和 `tests/examples/test_state_loop_demo.py`，并检查现有 `src` 与 `tests`。
- Ruff 检查整个仓库。
- 相对于功能分支基线，`git diff --exit-code main...HEAD -- src` 必须无输出且退出码为零。

## 9. 成功标准

- `run_once()` 签名严格返回 `Intervention`。
- 当前估计不参与自身基线计算。
- 三个演示事件确定性地生成 Ask、Suggest Break 和 Silence。
- 标准输出清晰展示输入、运行时间、历史基线、估计和干预。
- 脚本在激活项目虚拟环境后可直接通过 `python examples/state_loop_demo.py` 运行。
- mypy、Ruff 和完整测试通过。
- `src/` 下零修改。
