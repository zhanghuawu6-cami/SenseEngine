"""Typed State Computing memory contracts."""

from pydantic import AwareDatetime, Field

from sense_engine.core.models.base import ContractModel
from sense_engine.core.models.common import (
    FiniteJsonValue,
    JsonObject,
    NonEmptyStr,
    Probability,
)
from sense_engine.core.models.context_snapshot import ContextSnapshot
from sense_engine.core.models.state_estimate import StateEstimate


class EpisodeMemory(ContractModel):
    """Record one historical state estimate and its supporting evidence."""

    id: NonEmptyStr = Field(
        description="情节记忆的稳定标识，用于在 State Computing 中引用、追溯并关联一次历史状态记录。"
    )
    occurred_at: AwareDatetime = Field(
        description="历史状态发生的带时区时间，用于将情节记忆定位到 State Computing 的时间轴。"
    )
    state: StateEstimate = Field(
        description="该时刻保存的状态估计及其不确定性，作为 State Computing 后续判断可参考的历史结果。"
    )
    context: ContextSnapshot | None = Field(
        description="该历史状态对应的上下文证据快照；为空明确表示当时没有可用上下文，而非省略该语义。"
    )
    signal_event_ids: tuple[NonEmptyStr, ...] = Field(
        description="支撑该历史状态估计的信号事件标识集合，用于 State Computing 追溯证据来源；空集合表示没有可引用事件。"
    )


class PreferenceMemory(ContractModel):
    """Record a state-scoped preference learned from prior evidence."""

    id: NonEmptyStr = Field(
        description="偏好记忆的稳定标识，用于在 State Computing 中引用和追溯一条已记录偏好。"
    )
    state_scope: NonEmptyStr = Field(
        description="该偏好适用的状态范围，用于限制 State Computing 仅在相关状态下参考该记录。"
    )
    target: NonEmptyStr = Field(
        description="偏好所指向的对象或决策目标，用于说明 State Computing 可将偏好应用到何处。"
    )
    value: FiniteJsonValue = Field(
        description="偏好目标对应的 JSON 值，保留 State Computing 已记录的选择内容而不附加执行逻辑。"
    )
    confidence: Probability = Field(
        description="该偏好记录的有限置信度，用于表达 State Computing 对偏好证据可靠性的判断。"
    )
    updated_at: AwareDatetime = Field(
        description="偏好记录最近更新的带时区时间，用于 State Computing 判断记忆的新旧并保持可追溯性。"
    )


class RoutineMemory(ContractModel):
    """Record an observed routine pattern and its evidence strength."""

    id: NonEmptyStr = Field(
        description="惯例记忆的稳定标识，用于在 State Computing 中引用和追溯一项重复模式。"
    )
    name: NonEmptyStr = Field(
        description="惯例模式的可读名称，用于 State Computing 区分不同的历史行为规律。"
    )
    pattern: JsonObject = Field(
        description="描述惯例结构的 JSON 对象，仅保存 State Computing 已观测的模式数据，不包含匹配或执行算法。"
    )
    confidence: Probability = Field(
        description="惯例模式的有限置信度，用于表达 State Computing 对该重复规律证据强度的判断。"
    )
    observed_count: int = Field(
        ge=1,
        description="支持该惯例模式的正整数观测次数，用于说明 State Computing 形成记录所依据的证据数量。",
    )
    updated_at: AwareDatetime = Field(
        description="惯例记录最近更新的带时区时间，用于 State Computing 追溯模式证据的时效。"
    )


class CorrectionMemory(ContractModel):
    """Record an explicit correction to a previously stored value."""

    id: NonEmptyStr = Field(
        description="纠正记忆的稳定标识，用于在 State Computing 中引用和审计一次明确修正。"
    )
    target_id: NonEmptyStr = Field(
        description="被纠正记录的标识，用于将 State Computing 的修正信息关联到原始记忆。"
    )
    corrected_at: AwareDatetime = Field(
        description="纠正发生的带时区时间，用于在 State Computing 的历史中排序并追溯修正。"
    )
    original_value: FiniteJsonValue = Field(
        description="修正前保存的 JSON 值，用于 State Computing 保留原始判断并支持审计。"
    )
    corrected_value: FiniteJsonValue = Field(
        description="修正后确认的 JSON 值，用于 State Computing 记录应采用的更正结果。"
    )
    reason: NonEmptyStr | None = Field(
        default=None,
        description="纠正原因的可选说明；为空表示未提供理由，但不影响 State Computing 保留修正事实。",
    )


class DecayPolicy(ContractModel):
    """Store the latest decay-policy evaluation metadata without calculating weights."""

    policy_name: NonEmptyStr = Field(
        description="最近一次评估所采用的衰减策略名称，用于 State Computing 追溯权重元数据，不触发策略执行。"
    )
    weight: Probability = Field(
        description="最近一次评估保存的有限权重，用于 State Computing 读取既有衰减结果；本模型不计算新权重。"
    )
    evaluated_at: AwareDatetime = Field(
        description="衰减策略最近评估的带时区时间，仅记录 State Computing 的评估元数据，不启动重新计算。"
    )


class ProvenanceRecord(ContractModel):
    """Record where a memory entry came from and who recorded it."""

    source_type: NonEmptyStr = Field(
        description="记忆来源的类型，用于 State Computing 区分并追溯不同种类的上游证据。"
    )
    source_id: NonEmptyStr = Field(
        description="记忆来源记录的标识，用于 State Computing 定位产生该记忆的具体证据。"
    )
    recorded_at: AwareDatetime = Field(
        description="来源信息写入记忆的带时区时间，用于 State Computing 审计记录形成过程。"
    )
    actor: NonEmptyStr = Field(
        description="写入该来源记录的主体标识，用于 State Computing 明确记忆记录责任与可追溯性。"
    )


class StateMemory(ContractModel):
    """Aggregate the six Appendix A.1 State Computing memory fields."""

    episode: tuple[EpisodeMemory, ...] = Field(
        description="历史状态、上下文与证据引用组成的情节记忆集合，供 State Computing 回顾既有估计；可为空。"
    )
    preference: tuple[PreferenceMemory, ...] = Field(
        description="按状态范围记录的偏好记忆集合，供 State Computing 参考既有选择证据；可为空。"
    )
    routine: tuple[RoutineMemory, ...] = Field(
        description="从重复观测形成的惯例记忆集合，供 State Computing 参考历史模式证据；可为空。"
    )
    correction: tuple[CorrectionMemory, ...] = Field(
        description="对既有记忆值的显式纠正记录集合，供 State Computing 保留修正历史并支持审计；可为空。"
    )
    decay: DecayPolicy = Field(
        description="最近一次衰减策略评估的元数据，供 State Computing 读取既有权重；该字段不执行衰减计算。"
    )
    provenance: tuple[ProvenanceRecord, ...] = Field(
        description="记忆来源与记录主体的追溯信息集合，供 State Computing 审计证据来源；可为空。"
    )
