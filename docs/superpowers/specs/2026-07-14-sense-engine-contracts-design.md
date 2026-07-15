# SenseEngine 核心数据契约设计

**日期：** 2026-07-14
**状态：** 已批准
**契约版本：** 序感科技白皮书附录 A.1「核心数据契约 v0.2」

## 1. 目标

初始化 Python 版 `SenseEngine` 项目，并以 Pydantic v2 定义 State Computing 系统的六类核心数据契约：`SignalEvent`、`ContextSnapshot`、`StateEstimate`、`StateMemory`、`Intervention` 和 `Outcome`。

本阶段只建立类型安全、可验证、可生成 JSON Schema 的数据结构，不实现信号处理、状态推断、记忆存储、策略选择、干预执行或 API 路由。

## 2. 技术选择

- Python 3.11：使用现代类型标注语法并保持服务端生态兼容性。
- FastAPI：作为后续接口层框架依赖，本阶段不创建路由或业务接口。
- Pydantic v2：用于严格解析、字段约束、不可变契约和 JSON Schema 描述。
- pytest：验证契约结构、约束与序列化行为。
- mypy：验证静态类型安全。
- Ruff：验证格式和基础代码质量。

选择 Python 而非 NestJS，是为了延续现有 `SenseOrder_Phase0_Code.zip` 中的 Python/FastAPI 技术资产，并减少后续迁移成本。

## 3. 项目边界

### 包含

- `core`、`adapters`、`memory`、`policy`、`api` 模块目录。
- 六类核心数据契约及其必要的共享枚举、值对象和类型别名。
- 每个字段的中文状态计算语义说明。
- Pydantic 生成的 JSON Schema。
- 契约级测试、静态类型检查和代码质量配置。

### 不包含

- FastAPI 应用实例和 HTTP 路由。
- 信号适配器实现。
- 状态估计或概率归一化算法。
- 数据库、缓存、向量库或跨端同步。
- 策略规则、干预选择或结果学习。
- 白皮书中的 `AuditRecord`；它不在本次指定的六类模型范围内。

## 4. 目录结构

```text
SenseEngine/
├── README.md
├── pyproject.toml
├── src/
│   └── sense_engine/
│       ├── __init__.py
│       ├── core/
│       │   ├── __init__.py
│       │   └── models/
│       │       ├── __init__.py
│       │       ├── base.py
│       │       ├── common.py
│       │       ├── signal_event.py
│       │       ├── context_snapshot.py
│       │       ├── state_estimate.py
│       │       ├── state_memory.py
│       │       ├── intervention.py
│       │       └── outcome.py
│       ├── adapters/
│       │   └── __init__.py
│       ├── memory/
│       │   └── __init__.py
│       ├── policy/
│       │   └── __init__.py
│       └── api/
│           └── __init__.py
├── tests/
│   └── core/
│       └── test_models.py
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-07-14-sense-engine-contracts-design.md
```

`core.models` 是六类跨模块契约的唯一所有者。其他模块本阶段只声明边界，不重复定义或包装契约，避免产生多套不一致的 schema。

## 5. 通用契约规则

所有核心模型继承统一的 `ContractModel`，并采用以下配置：

- `extra="forbid"`：拒绝未在 v0.2 契约中声明的字段，防止上游拼写错误静默进入系统。
- `frozen=True`：禁止契约字段被重新赋值；集合字段优先使用元组，映射载荷由调用方按只读数据对待。
- `strict=True`：不执行有歧义的隐式类型转换，例如不把字符串 `"0.8"` 自动转成浮点数。
- 时间字段使用带时区的 `AwareDatetime`；调用方应提供 UTC 或明确偏移量。
- 概率、置信度、质量和缺失率使用闭区间 `[0.0, 1.0]`。
- 标识符和自然语言字段禁止空字符串。
- 结构化但尚未冻结业务词表的载荷使用递归 `JsonValue`，而不是无类型的 `Any`。
- 每个字段同时提供中文 `Field(description=...)`，使注释进入 JSON Schema 和 FastAPI 文档。

Pydantic 只负责结构和边界验证。模型中不加入自定义推断、自动补全、概率归一化或跨字段业务判断。

## 6. 模型设计

### 6.1 SignalEvent

表示适配器提交给 State Engine 的一次合法、可追踪的特征事件，不承载原始音频或图像。

| 字段 | 类型 | 状态计算含义 |
| --- | --- | --- |
| `time` | `AwareDatetime` | 特征在来源端成立的事件时间，用于窗口对齐、时序推断和记忆排序。 |
| `source` | `SignalSource` | 记录适配器、设备和信号模态，使状态判断可追溯到具体来源。 |
| `feature` | `FeaturePayload` | 只包含状态计算需要的派生特征和值及单位，不默认保存原始感知内容。 |
| `quality` | `SignalQuality` | 描述该特征的可用度、完整度和来源置信度，供下游评估证据权重。 |
| `consent_scope` | `ConsentScope` | 记录用户允许该信号用于哪些状态计算目的，以及授权依据和有效边界。 |
| `retention` | `RetentionPolicy` | 声明事件允许保留的期限、存储层级和到期动作，落实数据最小化。 |

辅助结构只表达数据：

- `SignalSource`：`adapter`、`device_id`、`modality`。
- `FeaturePayload`：`name`、`value`、可选 `unit`。
- `SignalQuality`：`score`、`completeness`、可选 `reason`。
- `ConsentScope`：`purposes`、`granted_at`、可选 `expires_at`。
- `RetentionPolicy`：`tier`、可选 `expires_at`、`on_expiry`。

### 6.2 ContextSnapshot

表示状态估计发生时的外部情境。情境是证据，不直接等同于用户心理或生理状态。

| 字段 | 类型 | 状态计算含义 |
| --- | --- | --- |
| `activity` | `Optional[ActivityContext]` | 当前活动及其来源置信度，为状态估计提供任务背景。 |
| `place` | `Optional[PlaceContext]` | 当前地点的语义类别和来源，不要求保存精确坐标。 |
| `calendar` | `tuple[CalendarContext, ...]` | 当前时间窗口相关的日程摘要，用于识别会议、专注时段或转换期。 |
| `people` | `Optional[PeopleContext]` | 描述在场人数和关系类别，不默认记录可识别个人身份。 |
| `environment` | `Optional[EnvironmentContext]` | 描述温度、光照、噪声等环境特征，为状态判断提供外部条件。 |

情境辅助结构使用明确字段，并为开放的环境指标保留 `dict[str, JsonValue]`，以便适配不同传感器而不引入业务逻辑。

### 6.3 StateEstimate

表示模型在给定信号和情境下产生的一次带不确定性的状态估计。

| 字段 | 类型 | 状态计算含义 |
| --- | --- | --- |
| `dimensions` | `dict[str, float]` | 多维连续状态值，例如认知负荷、唤醒度或疲劳度；维度名保持可扩展。 |
| `distribution` | `dict[str, Probability]` | 候选离散状态及其概率，保留不确定性而非只输出单一标签。 |
| `confidence` | `Probability` | 模型对整体估计可靠性的汇总判断，不等同于任一类别概率。 |
| `missingness` | `dict[str, Probability]` | 各预期输入的缺失比例或缺失程度，用于解释置信度和降级状态。 |
| `model_version` | `NonEmptyStr` | 生成该估计的模型或规则版本，用于复现、审计和跨版本比较。 |

`distribution` 不在模型层自动归一化；概率和必须为 1 属于上游模型输出责任，避免在纯数据结构中加入业务修正。

### 6.4 StateMemory

表示可跨终端复用并由用户控制的状态记忆集合，而不是具体数据库实现。

| 字段 | 类型 | 状态计算含义 |
| --- | --- | --- |
| `episode` | `tuple[EpisodeMemory, ...]` | 保存特定时间发生的状态片段及其上下文引用，用于回顾相似情境。 |
| `preference` | `tuple[PreferenceMemory, ...]` | 保存用户在特定状态或目标下对行动的明确偏好及证据强度。 |
| `routine` | `tuple[RoutineMemory, ...]` | 保存重复出现的时间或情境模式，并保留其支持样本和置信度。 |
| `correction` | `tuple[CorrectionMemory, ...]` | 保存用户对系统状态判断或记忆内容的纠正，作为后续计算的高优先级证据。 |
| `decay` | `DecayPolicy` | 声明记忆随时间降低活跃权重的元数据，不在模型内执行衰减算法。 |
| `provenance` | `tuple[ProvenanceRecord, ...]` | 记录记忆由何种事件、设备、模型或用户操作产生，支持解释和删除。 |

各记忆条目使用稳定 `id`、带时区时间、明确内容载荷和来源引用。`decay` 只存储策略名称、当前权重和评估时间，不计算新权重。

### 6.5 Intervention

表示系统提出或执行的一次可解释行动记录。

| 字段 | 类型 | 状态计算含义 |
| --- | --- | --- |
| `objective` | `NonEmptyStr` | 此次行动服务的用户目标，例如保护专注或降低打扰。 |
| `action` | `ActionSpec` | 描述行动类型、目标通道和参数，不直接执行外部设备操作。 |
| `risk` | `RiskAssessment` | 声明潜在影响的等级和理由，使策略层能够遵守风险边界。 |
| `reversibility` | `Reversibility` | 描述行动是否可撤销以及撤销方式和预计恢复时间。 |
| `expected_effect` | `dict[str, float]` | 描述预期改变的状态维度及方向或幅度，供结果评估对照。 |

### 6.6 Outcome

表示用户对干预的明确反馈以及在授权范围内观察到的行为代理结果。

| 字段 | 类型 | 状态计算含义 |
| --- | --- | --- |
| `accepted` | `bool` | 用户是否按原方案接受该干预。 |
| `adjusted` | `bool` | 用户是否在修改参数、时间或通道后接受干预。 |
| `rejected` | `bool` | 用户是否明确拒绝或撤销干预。 |
| `self_report` | `Optional[SelfReport]` | 用户主动提供的状态或效果反馈，是高价值的明确证据。 |
| `behavior_proxy` | `tuple[BehaviorProxy, ...]` | 在授权范围内观察到的行为代理指标，必须与明确反馈区分。 |

三个布尔字段按白皮书原字段保留。模型层不强制三者互斥，因为“是否互斥”属于反馈采集协议和业务状态机规则，而非数据结构本身。

## 7. 模块依赖方向

```text
adapters ─┐
memory ───┼──> core.models
policy ───┤
api ──────┘
```

`core.models` 不依赖其他业务模块。未来的适配器、记忆、策略和 API 层只能导入核心契约，不能让核心契约反向依赖具体实现。

## 8. 错误与验证边界

非法数据由 Pydantic 在对象构造或解析时产生结构化 `ValidationError`。本阶段不捕获、不翻译该异常，也不定义 HTTP 错误响应。

契约验证覆盖：

- 必填字段存在且类型严格。
- 时间字段包含时区。
- 数值边界满足声明范围。
- 空字符串和未知字段被拒绝。
- 所有字段描述出现在 JSON Schema 中。
- 合法对象可以序列化为 JSON 并无损解析回来。

## 9. 测试策略

按照测试先行顺序实现：

1. 先写六个模型导入与完整字段集合测试，并确认因模型尚不存在而失败。
2. 实现共享基类、类型和六个模型，使字段集合测试通过。
3. 写严格类型、时区、数值边界和未知字段拒绝测试，并确认约束缺失时失败。
4. 增加最小 Pydantic 配置和字段约束，使验证测试通过。
5. 写 JSON Schema 描述与序列化往返测试，并实现缺失的描述或导出配置。
6. 运行 pytest、mypy 和 Ruff，对纯结构代码做最终验证。

## 10. 验收标准

- `SenseEngine` 具备可安装的 Python 包结构。
- 五个要求模块均存在且可导入。
- 六个核心模型完整覆盖附录 A.1 v0.2 对应字段。
- 每个核心字段都具有可读的中文注释和 JSON Schema 描述。
- 所有模型拒绝未知字段和不符合严格类型要求的输入。
- 项目不包含任何业务逻辑、API 路由或持久化实现。
- pytest、mypy 和 Ruff 全部通过。
