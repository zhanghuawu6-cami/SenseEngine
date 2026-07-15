# State Memory 与 Intervention Policy 设计规格

**日期：** 2026-07-15
**状态：** 已批准
**适用系统：** SenseEngine State Runtime / Memory / Policy

## 1. 目标

在不修改阶段一核心数据契约的前提下，实现两个独立运行时服务：

- `StateMemoryBank`：将状态估计与写入时间保存在进程内，并计算指定时间窗口内的平均认知负荷。
- `InterventionPolicy`：根据当前 `StateEstimate` 与个体基线，按固定优先级构造完整的 `Intervention` 声明式契约。

设计遵循两项原则：

- 个体基线：当前负荷必须相对于近期历史评估。
- 克制与不确定性治理：低置信度时不强制建议，而是请求用户确认；无过载证据时保持安静。

## 2. 范围

### 2.1 本轮包含

- 进程内记忆列表，不落盘。
- 写入时间记录与可注入时钟。
- 指定分钟窗口内的平均 `cognitive_load` 基线。
- 冷启动中性基线 `0.5`。
- Ask、Suggest Break 和 Silence 三种策略决策。
- 完整 `Intervention` 风险、可逆性和预期效果映射。
- 单元测试、mypy strict 与 Ruff 验证。

### 2.2 本轮不包含

- 数据库、文件、缓存、向量库或其他持久化存储。
- API 路由、网络调用、任务调度或 UI 通知。
- 干预执行、通知派发或设备控制。
- 个体模型训练、在线学习或基线持久化。
- 修改 `StateEstimate`、`StateMemory`、`Intervention` 或其他核心数据契约。

## 3. 架构与文件边界

```text
src/sense_engine/
├── memory/
│   └── state_memory.py
├── policy/
│   └── intervention_policy.py
└── core/models/
    ├── state_estimate.py      # 只读依赖，不修改
    └── intervention.py       # 只读依赖，不修改

tests/
├── memory/test_state_memory.py
└── policy/test_intervention_policy.py
```

`StateMemoryBank` 是运行时服务，不等同于 `core.models.StateMemory` 便携契约。
`InterventionPolicy` 只消费 `StateEstimate` 并构造现有 `Intervention`，不执行动作。

## 4. StateMemoryBank

### 4.1 时钟与条目

时钟类型为 `Callable[[], datetime]`。默认时钟返回 `datetime.now(tz=UTC)`，测试可注入可控假时钟。

内部条目是私有且不可变的值对象：

```python
@dataclass(frozen=True, slots=True)
class _MemoryEntry:
    recorded_at: datetime
    estimate: StateEstimate
```

`save_event(estimate)` 每次只调用一次时钟，校验返回值包含时区，然后保存时间与估计。不生成 `EpisodeMemory`、ID、上下文或信号引用。

### 4.2 基线窗口

`get_baseline(window_minutes: int = 60) -> float` 在调用时再读取一次时钟，并定义：

```text
cutoff = now - timedelta(minutes=window_minutes)
有效时间范围 = cutoff <= recorded_at <= now
```

- 起点边界包含在窗口内。
- 未来时间条目不参与计算。
- 仅统计存在 `dimensions["cognitive_load"]` 且值为有限数的条目。
- 缺失、布尔值、非数值或非有限的负荷值作为脏数据跳过。
- 有有效条目时返回算术平均值。
- 无有效条目时严格返回 `0.5`。

### 4.3 输入校验

- `window_minutes <= 0` 时抛出 `ValueError`。
- 保存或查询时，时钟返回无时区 `datetime` 则抛出 `ValueError`。
- 运行时服务不修改输入 `StateEstimate`。

## 5. InterventionPolicy

### 5.1 方法与优先级

```python
def decide_action(
    self,
    estimate: StateEstimate,
    baseline: float,
) -> Intervention:
    ...
```

按以下顺序评估，第一个命中项决定结果：

1. `estimate.confidence < 0.5`：Ask。
2. `cognitive_load > baseline + 0.2` 且 `estimate.confidence >= 0.7`：Suggest Break。
3. 其他情况：Silence。

低置信度规则优先于负荷规则。即使负荷很高，低置信度也只返回 Ask。
缺少 `cognitive_load` 且置信度不低时返回 Silence，因为没有证据支持主动干预。

### 5.2 完整契约映射

| 决策 | Ask | Suggest Break | Silence |
| --- | --- | --- | --- |
| `objective` | `confirm-current-state` | `reduce-cognitive-load` | `preserve-focus` |
| `action.type` | `Ask` | `Suggest Break` | `Silence` |
| `action.channel` | `user-prompt` | `recommendation` | `none` |
| `action.parameters` | `{}` | `{}` | `{}` |
| `risk.level` | `LOW` | `LOW` | `LOW` |
| `risk.rationale` | `系统不确定当前状态，需要用户确认` | `认知负荷显著高于个人基线，建议休息` | `状态良好，保持安静` |
| `reversibility.is_reversible` | `True` | `True` | `True` |
| `reversibility.method` | `dismiss-prompt` | `dismiss-suggestion` | `no-action-required` |
| `reversibility.recovery_seconds` | `0.0` | `0.0` | `0.0` |
| `expected_effect` | `{"cognitive_load": 0.0}` | `{"cognitive_load": -0.2}` | `{"cognitive_load": 0.0}` |

三种结果均为低风险、可逆或无外部动作的声明。策略只构造数据契约，不调用通知、日历、系统设置或任何 UI。

## 6. 测试策略

### 6.1 StateMemoryBank

- Red 先验证模块不存在或行为未实现。
- 假时钟下，空记忆返回 `0.5`。
- 70 分钟前条目不进入 60 分钟窗口。
- 窗口内多个负荷值返回正确算术平均。
- 恰好 60 分钟前的条目计入窗口，未来条目排除。
- 缺少或脏 `cognitive_load` 的条目跳过。
- 非正窗口和无时区时钟抛出 `ValueError`。

### 6.2 InterventionPolicy

- 低置信度返回 Ask，并验证中文 `risk.rationale`、可逆性和预期效果。
- 高于基线 `0.2` 且置信度不低于 `0.7` 时返回 Suggest Break，并验证完整安全字段。
- 正常状态返回 Silence，并验证无外部动作的映射。
- 同时满足低置信度和高负荷时，Ask 优先。
- 缺少 `cognitive_load` 时保持 Silence。
- 每个结果均是通过 Pydantic 严格契约校验的 `Intervention`。

### 6.3 质量门禁

- 定向记忆和策略测试。
- 完整 pytest 回归测试。
- mypy strict 对 `src` 和 `tests` 无问题。
- Ruff 检查通过。
- Git 差异不包含任何核心契约修改、持久化、API 或 UI 代码。

## 7. 成功标准

- `StateMemoryBank` 在可控时钟下给出确定的时间窗口基线。
- 空窗口严格返回 `0.5`，不会在冷启动时系统性放大过载判断。
- `InterventionPolicy` 只返回 Ask、Suggest Break 或 Silence 的完整契约表达。
- 低置信度不会触发建议休息。
- 所有干预均包含明确风险依据、可逆性和预期效果。
- 现有六个核心数据契约及其公共导出集合保持不变。
