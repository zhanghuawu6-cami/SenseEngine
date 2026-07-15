"""Typed signal event contracts for State Computing inputs."""

from enum import StrEnum

from pydantic import AwareDatetime, Field

from sense_engine.core.models.base import ContractModel
from sense_engine.core.models.common import FiniteJsonValue, NonEmptyStr, Probability


class RetentionTier(StrEnum):
    """Supported signal retention lifetime tiers."""

    EPHEMERAL = "ephemeral"
    SESSION = "session"
    PERSISTENT = "persistent"


class ExpiryAction(StrEnum):
    """Supported handling actions when retained data expires."""

    DELETE = "delete"
    AGGREGATE = "aggregate"
    ANONYMIZE = "anonymize"


class SignalSource(ContractModel):
    """Record caller-declared signal provenance without verifying its claims."""

    adapter: NonEmptyStr = Field(
        description="调用方声明的适配器标识，用于记录 State Computing 输入的来源；本模型不验证接入或标准化过程。"
    )
    device_id: NonEmptyStr = Field(
        description="调用方声明的匿名或假名化设备来源标识，用于追溯证据来源；本模型仅记录该值，不验证其去标识化状态或是否为原始硬件标识。"
    )
    modality: NonEmptyStr = Field(
        description="调用方声明的信号感知模态，用于记录状态计算输入类型；本模型不验证其语义。"
    )


class FeaturePayload(ContractModel):
    """Record caller-declared derived JSON without semantic content inspection."""

    name: NonEmptyStr = Field(
        description="调用方声明的派生特征名称，用于标识提供给 State Computing 的数据；本模型不验证其语义。"
    )
    value: FiniteJsonValue = Field(
        description="调用方声明的派生特征有限 JSON 值；本模型仅实施有限数值等结构约束，不进行语义检查，也不识别或拒绝原始媒体内容。"
    )
    unit: NonEmptyStr | None = Field(
        default=None,
        description="调用方声明的派生特征计量单位；无适用单位时为空，本模型不验证单位语义。",
    )


class SignalQuality(ContractModel):
    """Record caller-declared signal quality metadata without calculating it."""

    score: Probability = Field(
        description="调用方声明的信号总体可靠度，本模型仅校验概率数值边界，不计算或调整质量。"
    )
    completeness: Probability = Field(
        description="调用方声明的信号完整度，本模型仅校验概率数值边界，不验证采样范围或缺失程度。"
    )
    reason: NonEmptyStr | None = Field(
        default=None,
        description="质量受限的可解释原因；质量无需补充说明时为空。",
    )


class ConsentScope(ContractModel):
    """Record caller-declared consent metadata without validating authorization."""

    purposes: tuple[NonEmptyStr, ...] = Field(
        min_length=1,
        description="调用方声明的同意目的集合；本模型仅记录非空值，不验证同意有效性、适用范围或用户身份。",
    )
    granted_at: AwareDatetime = Field(
        description="调用方声明的同意授予时间；本模型仅校验时区信息，不判定同意是否已生效。"
    )
    expires_at: AwareDatetime | None = Field(
        default=None,
        description="调用方声明的同意到期时间；为空表示未声明固定时刻，本模型不判定同意是否失效。",
    )


class RetentionPolicy(ContractModel):
    """Record caller-declared retention metadata without enforcing lifecycle actions."""

    tier: RetentionTier = Field(
        description="调用方声明的信号保留层级；本模型仅记录枚举值，不实施保留期限。"
    )
    expires_at: AwareDatetime | None = Field(
        default=None,
        description="调用方声明的保留到期时间；为空表示未声明固定时刻，本模型不触发到期处理。",
    )
    on_expiry: ExpiryAction = Field(
        description="调用方声明的到期处理动作；本模型仅记录保留策略，不执行删除、聚合、匿名化或其他保留策略。"
    )


class SignalEvent(ContractModel):
    """Record a signal and caller-declared metadata without policy enforcement."""

    time: AwareDatetime = Field(
        description="调用方提供的带时区信号事件时间，用于记录 State Computing 时间轴位置。"
    )
    source: SignalSource = Field(
        description="调用方声明的适配器、设备与模态来源；本模型仅记录溯源元数据，不验证其真实性。"
    )
    feature: FeaturePayload = Field(
        description="调用方声明的派生特征载荷；本模型仅校验数据结构，不检查或拒绝原始媒体内容。"
    )
    quality: SignalQuality = Field(
        description="调用方声明的信号质量元数据；本模型仅记录有界数值，不计算或应用可靠性权重。"
    )
    consent_scope: ConsentScope = Field(
        description="调用方声明的同意目的与时间元数据；本模型仅记录，不验证同意范围、有效性或用户身份。"
    )
    retention: RetentionPolicy = Field(
        description="调用方声明的保留层级、到期时间与动作；本模型仅记录，不执行保留、删除或匿名化。"
    )
