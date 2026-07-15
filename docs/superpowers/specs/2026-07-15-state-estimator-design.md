# StateEstimator 设计规格

**日期：** 2026-07-15
**状态：** 已批准
**适用系统：** SenseEngine State Runtime / State Model

## 1. 目标

实现首版基于规则的 `StateEstimator`，使用电脑活动复合信号与日历上下文输出概率化、可解释、带缺失度和模型版本的 `StateEstimate`。

该设计遵循白皮书 4.2 与 4.3 的三个原则：

- 概率优先：输出完整候选概率分布，不输出绝对状态标签。
- 个体基线：所有阈值通过可注入的基线值对象提供；首版使用默认基线。
- 可解释性：每次估计至少包含一条人类可读的主要证据。

## 2. 范围

### 本轮包含

- `StateEstimate` 从 v0.2 升级为 v0.3。
- 新增必填 `explanation: tuple[str, ...]` 字段。
- `StateEstimator.estimate(signal_events, context) -> StateEstimate`。
- Flow、Friction、Cognitive Overload 和 Unknown 四类概率分布。
- 默认个体基线与构造器注入能力。
- 最新合法电脑活动快照提取。
- 会议持续时间计算。
- 缺失或畸形信号降级。
- 独立 StateEstimator 测试与阶段一契约回归更新。

### 本轮不包含

- 深度学习、模型训练或参数学习。
- 数据库、文件、缓存或向量存储。
- `CalendarAdapter`。
- State Policy、干预选择或执行。
- 医疗、能力、智商、绩效或疾病推断。
- 对用户状态输出绝对、确定性的单一标签。

## 3. 文件结构

```text
SenseEngine/
├── src/sense_engine/core/
│   ├── state_estimator.py
│   └── models/state_estimate.py
└── tests/
    ├── core/test_models.py
    └── core/test_state_estimator.py
```

`StateEstimator` 从 `sense_engine.core.state_estimator` 显式导入。本轮不修改 `sense_engine.core.__all__`，避免把运行时服务类混入六个核心数据契约的公共导出集合。

## 4. StateEstimate v0.3

v0.3 字段集合：

```python
class StateEstimate(ContractModel):
    dimensions: DimensionMap
    distribution: DistributionMap
    confidence: Probability
    missingness: MissingnessMap
    model_version: NonEmptyStr
    explanation: ExplanationList
```

`ExplanationList` 定义为至少包含一项的非空字符串元组：

```python
ExplanationList = Annotated[
    tuple[NonEmptyStr, ...],
    Field(min_length=1),
]
```

`explanation` 是正式 JSON Schema 字段，参与序列化、API 输出、审计和 JSON 往返。所有阶段一测试工厂和直接构造点必须显式提供它；缺失、空元组或空白解释由 Pydantic 拒绝。

## 5. 默认个体基线

首版使用不可变、可注入的基线值对象：

```python
@dataclass(frozen=True, slots=True)
class StateBaseline:
    flow_typing_speed: str = "High"
    flow_mouse_movement_frequency: str = "Low"
    friction_typing_speed: str = "Low"
    friction_mouse_movement_frequency: str = "High"
    meeting_overload_minutes: float = 60.0
```

`StateEstimator` 构造器接受 `StateBaseline | None`，为空时创建默认基线。未来可从 State Memory 或个体模型构造不同基线，无需修改 `estimate()` 签名或规则引擎的数据流。

本轮基线只提供比较值，不执行在线学习、用户分群或持久化。

## 6. 输入与证据提取

### 6.1 电脑活动

从 `signal_events` 中筛选 `feature.name == "computer_activity_snapshot"` 的事件，按 `SignalEvent.time` 选择时间最新的合法复合载荷。

合法载荷必须为 JSON 对象，且 `typing_speed` 与 `mouse_movement_frequency` 均为字符串。缺失字段、类型错误或非对象载荷视为畸形证据并被忽略，不抛出业务异常。

### 6.2 会议上下文

会议过载需要同时满足：

1. `context.activity` 存在且 `activity.name` 大小写不敏感地等于 `Meeting`。
2. `context.calendar` 中至少有一个 `event_type` 等于 `Meeting` 且 `busy=True` 的事件。
3. 该事件 `ends_at - starts_at` 为正数，并严格大于基线 `meeting_overload_minutes`。

若存在多个有效会议事件，使用持续时间最长者作为主要证据。

## 7. 规则优先级

规则按以下顺序评估，第一个命中的规则决定本次固定概率模板：

1. Cognitive Overload：长会议规则。
2. Friction：打字速度等于基线低速值，鼠标频率等于基线高频值。
3. Flow：打字速度等于基线高速值，鼠标频率等于基线低频值。
4. Unknown：没有规则命中。

优先级确保电脑活动呈现 Flow，但当前上下文同时为超长会议时，输出仍以 Cognitive Overload 概率最高。该结果不是绝对标签，而是具有最高概率的候选状态。

## 8. 固定概率输出

候选键固定为：

- `flow`
- `friction`
- `cognitive_overload`
- `unknown`

| 命中规则 | flow | friction | cognitive_overload | unknown | confidence | cognitive_load |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Flow | 0.85 | 0.05 | 0.05 | 0.05 | 0.85 | 0.55 |
| Friction | 0.10 | 0.70 | 0.10 | 0.10 | 0.70 | 0.65 |
| Cognitive Overload | 0.05 | 0.05 | 0.80 | 0.10 | 0.80 | 0.90 |
| Unknown | 0.20 | 0.20 | 0.20 | 0.40 | 0.40 | 0.50 |

实现通过共享分布构造函数生成前三项，并将 `unknown` 计算为 `1.0 - sum(前三项)`。返回字典保持 `flow`、`friction`、`cognitive_overload`、`unknown` 的插入顺序，使 `sum(distribution.values()) == 1.0` 严格成立。

`dimensions` 首版只包含：

```python
{"cognitive_load": <表中数值>}
```

## 9. 缺失度、版本与解释

`missingness` 固定包含两个输入维度：

- `computer_activity`：找到合法复合电脑活动证据时为 `0.0`，否则为 `1.0`。
- `calendar_context`：存在至少一个合法正时长会议日历事件时为 `0.0`，否则为 `1.0`。

`model_version` 固定为 `state-estimator-rules-v0.1`。

解释模板：

- Flow：`High typing speed combined with low mouse movement indicates deep focus.`
- Friction：`Low typing speed combined with high mouse movement indicates interaction friction.`
- Cognitive Overload：`Meeting duration of {duration} minutes exceeds the {threshold}-minute baseline.`
- Unknown：`Available evidence does not strongly support a specific state.`

解释只陈述触发规则与证据，不声称医疗诊断、工作能力或确定性心理结论。

## 10. 错误与降级机制

- 空事件列表、缺少电脑活动、畸形电脑载荷、缺少活动上下文或缺少日历上下文都不抛业务异常。
- 没有其他规则命中时，返回 Unknown 概率最高、`confidence=0.40` 的低置信度结果。
- 负数或零会议时长不参与会议过载判断。
- 不修改输入 `SignalEvent` 或 `ContextSnapshot`。
- Pydantic 仍负责输出数据的类型、范围、有限数值和必填解释验证。

## 11. 测试策略

### 11.1 契约升级测试

1. 先将字段集期望更新为 v0.3，观察因 `explanation` 缺失而 RED。
2. 新增字段后，更新所有 `StateEstimate` 构造点。
3. 验证 explanation 必填、非空、非空白、具有中文 Schema 描述并参与 JSON 往返。
4. 确保六个既有顶层数据契约公共导出不变。

### 11.2 StateEstimator 规则测试

独立测试文件至少覆盖：

1. High typing + Low mouse 命中 Flow。
2. Low typing + High mouse 命中 Friction。
3. Meeting 且持续时间超过 60 分钟命中 Cognitive Overload。
4. Flow 与 Overload 同时命中时 Overload 优先。
5. 缺失电脑活动与上下文时输出低置信度 Unknown。
6. 畸形电脑活动载荷时输出低置信度 Unknown。
7. 每个规则模板的概率和严格等于 `1.0`。
8. 最新合法电脑活动事件优先于旧事件。
9. 自定义基线能够改变会议过载阈值。
10. 输出包含 `cognitive_load`、missingness、模型版本和人类可读解释。

## 12. 验收标准

- `StateEstimate` v0.3 契约和所有阶段一回归测试同步完成。
- Flow、Friction、Cognitive Overload、Unknown 规则均输出概率分布而非绝对标签。
- 多规则冲突遵守 Overload > Friction > Flow > Unknown。
- 缺失和畸形输入安全降级为低置信度 Unknown。
- 默认基线被实际用于所有规则比较，且支持注入自定义值。
- 所有分布严格合计为 `1.0`。
- 不实现模型训练、持久化、CalendarAdapter 或策略行动。
- 全量 pytest、mypy strict 与 Ruff 全部通过。
