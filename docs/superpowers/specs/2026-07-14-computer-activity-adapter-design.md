# ComputerActivityAdapter 设计规格

**日期：** 2026-07-14  
**状态：** 已批准  
**适用系统：** SenseEngine State Runtime / Signal Adapters

## 1. 目标

实现首个电脑活动信号适配器 `ComputerActivityAdapter`。适配器模拟采集同一时刻的活跃窗口、打字速度和鼠标移动频率，并将三项特征聚合为一个具有完整时间语义的复合 `SignalEvent`。

该设计服务于白皮书 4.4 所定义的“高强度知识工作者”首版场景，并遵循端侧优先、数据最小化和复合快照时间对齐原则。

## 2. 范围

### 本轮包含

- `adapters/computer_activity.py` 中的 `ComputerActivityAdapter`。
- `capture_activity() -> SignalEvent` 公共方法。
- 可扩展的复合 `feature.value` JSON 结构。
- 随机模拟活跃窗口、打字速度和鼠标移动频率。
- 显式透传 `consent_scope` 与 `retention`。
- 模拟信号的声明式 `quality` 元数据。
- 独立适配器测试。

### 本轮不包含

- `CalendarAdapter`。
- `SignalProcessor`。
- `StateEstimator`。
- 真实操作系统窗口、键盘或鼠标监听。
- API 路由、数据库、队列或持久化。
- 授权有效性验证、保留策略执行或用户身份确认。

## 3. 文件结构

```text
SenseEngine/
├── src/sense_engine/adapters/
│   ├── __init__.py
│   └── computer_activity.py
└── tests/adapters/
    └── test_computer_activity.py
```

本轮不要求从 `sense_engine.adapters` 包根重导出该类；调用方从 `sense_engine.adapters.computer_activity` 显式导入，避免提前冻结完整适配器公共 API。

## 4. 公共 API

```python
class ComputerActivityAdapter:
    def __init__(
        self,
        *,
        device_id: str,
        consent_scope: ConsentScope,
        retention: RetentionPolicy,
        rng: random.Random | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None: ...

    def capture_activity(self) -> SignalEvent: ...
```

构造器采用关键字参数，避免多个相同基础类型参数被错误交换。

- `device_id`：调用方声明的匿名或假名化设备来源标识；适配器只记录，不验证去标识化。
- `consent_scope`：调用方声明的授权元数据；适配器原样写入事件，不判断授权是否有效。
- `retention`：调用方声明的保留策略；适配器原样写入事件，不执行删除或匿名化。
- `rng`：可选随机数生成器；生产模拟默认使用独立 `random.Random`，测试可注入固定种子。
- `clock`：可选时钟；默认返回当前 UTC aware datetime，测试可注入固定时间。

## 5. 复合事件结构

一次 `capture_activity()` 调用只产生一个 `SignalEvent`：

```json
{
  "feature": {
    "name": "computer_activity_snapshot",
    "value": {
      "schema_version": "1.0",
      "active_window": "VS Code",
      "typing_speed": "High",
      "mouse_movement_frequency": "Low"
    },
    "unit": null
  }
}
```

`feature.value` 内部通过 `TypedDict` 表达静态结构，并作为 `FiniteJsonValue` 交给阶段一的 `FeaturePayload` 验证。

字段语义：

- `schema_version`：复合载荷版本。本轮固定为 `1.0`；未来新增屏幕亮度或应用切换频率时，按兼容性要求升级。
- `active_window`：采样时刻的前台应用名称。
- `typing_speed`：采样窗口内的离散打字速度等级。
- `mouse_movement_frequency`：采样窗口内的离散鼠标移动频率等级。

本轮模拟值域：

- 活跃窗口：`VS Code`、`Google Chrome`、`Terminal`、`Figma`、`Slack`。
- 打字速度：`Low`、`Moderate`、`High`。
- 鼠标移动频率：`Low`、`Moderate`、`High`。

## 6. SignalEvent 元数据

`capture_activity()` 构造以下事件元数据：

- `time`：由注入时钟或默认 UTC 时钟产生。
- `source.adapter`：`computer_activity_adapter`。
- `source.device_id`：构造器传入值。
- `source.modality`：`computer_activity`。
- `quality.score`：`0.85`，表示模拟适配器声明的整体可靠度。
- `quality.completeness`：`1.0`，表示本次复合快照三个字段均已生成。
- `quality.reason`：`simulated_complete_snapshot`，明确质量来自模拟数据声明。
- `consent_scope`：与构造器传入模型等值。
- `retention`：与构造器传入模型等值。

适配器不验证质量真实性、授权有效性或保留策略执行情况；这些字段保持阶段一契约中“调用方声明、模型记录”的语义。

## 7. 类型与依赖

- 只依赖 Python 标准库和现有 `sense_engine.core.models.signal_event`。
- 不引入第三方依赖。
- 使用 `TypedDict`、`Callable` 和完整返回类型标注。
- 常量值域使用不可变元组，避免运行时意外修改。
- 代码遵守现有 Ruff、mypy strict 和 PEP 8 配置。

## 8. 错误边界

- 空 `device_id`、无时区时间或不合法授权/保留模型由现有 Pydantic 契约拒绝。
- 适配器不捕获并转换 `ValidationError`，避免隐藏上游输入问题。
- 随机选择只从固定非空值域读取，不提供外部插件或动态配置。

## 9. 测试策略

测试先行实现，独立测试文件覆盖：

1. `capture_activity()` 返回单个 `SignalEvent`。
2. `feature.name` 与复合 `feature.value` 的键集合准确。
3. `schema_version` 固定为 `1.0`。
4. 三项模拟值始终位于批准值域。
5. 固定时钟产生相同的 UTC aware 事件时间。
6. `device_id`、`consent_scope` 和 `retention` 正确透传。
7. `quality` 的分数、完整度和模拟原因准确。
8. 事件执行 `model_dump_json()` 后可由 `SignalEvent.model_validate_json()` 无损恢复。
9. 无效的空设备标识和 naive datetime 继续由阶段一契约拒绝。

## 10. 验收标准

- 仅新增电脑活动适配器和独立测试，不实现明确排除的模块。
- 每次采集返回一个复合 `SignalEvent`，不存在拆分事件或时间戳错位。
- `feature.value` 结构清晰、版本化并可扩展。
- 授权、保留、质量、来源和 UTC 时间完整存在。
- 新增测试与现有全量回归测试全部通过。
- mypy strict 与 Ruff 全部通过。

