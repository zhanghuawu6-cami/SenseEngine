"""Collected intervention outcome contracts for State Computing."""

from pydantic import AwareDatetime, Field

from sense_engine.core.models.base import ContractModel
from sense_engine.core.models.common import FiniteFloat, FiniteJsonValue, NonEmptyStr


class SelfReport(ContractModel):
    """Record outcome evidence explicitly reported by the user."""

    reported_at: AwareDatetime = Field(
        description="用户自我报告的带时区时间，用于 State Computing 将主观结果证据对齐到干预时间轴。"
    )
    dimensions: dict[NonEmptyStr, FiniteFloat] = Field(
        description="用户自我报告的状态维度及有限数值，属于主观证据，明确区别于附带调用方授权声明的行为代理观测。"
    )
    note: NonEmptyStr | None = Field(
        default=None,
        description="用户自我报告的可选非空补充说明；为空表示未提供备注，不由 State Computing 自动补写。",
    )


class BehaviorProxy(ContractModel):
    """Record a proxy observation with a caller-declared authorization reference."""

    name: NonEmptyStr = Field(
        description="行为代理指标的非空名称，用于 State Computing 标识附带调用方授权声明的外部观测，且不等同于用户自我报告。"
    )
    observed_at: AwareDatetime = Field(
        description="行为代理被观测的带时区时间，用于 State Computing 对齐外部结果证据的发生时刻。"
    )
    value: FiniteJsonValue = Field(
        description="行为代理的 JSON 观测值，仅记录附带调用方授权声明的外部证据，不将其解释为用户主观自我报告。"
    )
    authorization_reference: NonEmptyStr = Field(
        description="调用方声明并记录的非空授权引用，供 State Computing 追溯证据来源；本模型不验证授权范围、有效性或采集许可。"
    )


class Outcome(ContractModel):
    """Store collected outcome data without protocol or learning behavior."""

    accepted: bool = Field(
        description="采集协议提供的接受标记，State Computing 仅按原值记录；与其他标记的状态约束由外部协议负责。"
    )
    adjusted: bool = Field(
        description="采集协议提供的调整标记，State Computing 仅按原值记录；本模型不推导业务状态或互斥关系。"
    )
    rejected: bool = Field(
        description="采集协议提供的拒绝标记，State Computing 仅按原值记录；本模型不执行状态机或互斥校验。"
    )
    self_report: SelfReport | None = Field(
        description="显式提供的用户自我报告；为空表示未收集主观证据，该字段与附带调用方授权声明的行为代理证据明确区分。"
    )
    behavior_proxy: tuple[BehaviorProxy, ...] = Field(
        description="附带调用方声明授权引用的行为代理证据集合；空集合表示未记录代理观测，且本模型不验证授权范围、有效性或采集许可。"
    )
