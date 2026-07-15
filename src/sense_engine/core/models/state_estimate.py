"""Typed State Computing estimate contracts."""

from typing import Annotated

from pydantic import Field

from sense_engine.core.models.base import ContractModel
from sense_engine.core.models.common import FiniteFloat, NonEmptyStr, Probability

DimensionMap = Annotated[dict[NonEmptyStr, FiniteFloat], Field(min_length=1)]
DistributionMap = Annotated[dict[NonEmptyStr, Probability], Field(min_length=1)]
MissingnessMap = dict[NonEmptyStr, Probability]


class StateEstimate(ContractModel):
    """Represent a versioned State Computing result with explicit uncertainty."""

    dimensions: DimensionMap = Field(
        description="连续状态维度及其有限数值，例如认知负荷，用于表达 State Computing 的多维估计结果。"
    )
    distribution: DistributionMap = Field(
        description="候选状态及其概率分布，保留不同状态之间的不确定性，不要求将候选概率强制归一化。"
    )
    confidence: Probability = Field(
        description="本次状态估计的总体可信度，反映结果整体可靠性，并与任一候选类别的概率明确区分。"
    )
    missingness: MissingnessMap = Field(
        description="各类输入的缺失程度，用于解释因证据不完整而降级的状态估计及其可信度。"
    )
    model_version: NonEmptyStr = Field(
        description="生成该估计的模型或规则版本，用于复现、追溯并比较 State Computing 结果。"
    )
