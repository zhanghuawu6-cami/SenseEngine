"""Declarative intervention contracts for State Computing outputs."""

from enum import StrEnum

from pydantic import Field

from sense_engine.core.models.base import ContractModel
from sense_engine.core.models.common import FiniteFloat, JsonObject, NonEmptyStr


class RiskLevel(StrEnum):
    """Supported declarative intervention risk levels."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ActionSpec(ContractModel):
    """Describe an action without executing or dispatching it."""

    type: NonEmptyStr = Field(
        description="拟议动作的语义类型，用于 State Computing 声明干预形式；构造该字段不会执行动作。"
    )
    channel: NonEmptyStr = Field(
        description="拟议动作面向的交互或设备通道，用于 State Computing 表达交付位置，而非触发通道调用。"
    )
    parameters: JsonObject = Field(
        description="拟议动作的 JSON 参数对象，仅保存 State Computing 的声明数据，不包含执行或调度逻辑。"
    )


class RiskAssessment(ContractModel):
    """Store a supplied risk assessment without calculating risk."""

    level: RiskLevel = Field(
        description="干预的已声明风险等级，供 State Computing 传递既有评估结果；本模型不计算或调整风险。"
    )
    rationale: NonEmptyStr = Field(
        description="风险等级的非空依据说明，用于 State Computing 保留可解释性与审计信息，不执行政策判断。"
    )


class Reversibility(ContractModel):
    """Describe whether and how a proposed action can be reversed."""

    is_reversible: bool = Field(
        description="声明拟议动作是否可逆，供 State Computing 表达恢复属性；该布尔值本身不启动恢复。"
    )
    method: NonEmptyStr | None = Field(
        default=None,
        description="可选的恢复方法说明；为空表示未声明方法，State Computing 不据此推导或执行恢复步骤。",
    )
    recovery_seconds: float | None = Field(
        default=None,
        ge=0,
        allow_inf_nan=False,
        description="可选的有限非负恢复时长（秒）；零表示可立即恢复，仅作为 State Computing 的声明元数据。",
    )


class Intervention(ContractModel):
    """Represent a declarative intervention that never executes its action."""

    objective: NonEmptyStr = Field(
        description="干预希望支持的非空目标，用于 State Computing 说明提议目的，不代表目标已实现。"
    )
    action: ActionSpec = Field(
        description="拟议动作的类型、通道与参数声明；State Computing 构造或读取本模型时绝不执行该动作。"
    )
    risk: RiskAssessment = Field(
        description="随干预提供的风险等级与依据，供 State Computing 展示和审计；本模型不包含风险计算或政策逻辑。"
    )
    reversibility: Reversibility = Field(
        description="拟议动作的可逆性声明，供 State Computing 表达恢复条件；本模型不验证跨字段政策或执行恢复。"
    )
    expected_effect: dict[NonEmptyStr, FiniteFloat] = Field(
        description="各状态维度的有限预期变化值，表达 State Computing 的声明性效果假设，不预测或保证实际结果。"
    )
