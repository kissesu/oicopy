# DatabaseOptimization 组件

数据库优化中心组件，用于管理和优化剪贴板应用的数据库性能。

## 功能特性

### 核心功能
- **统计信息展示**: 实时显示数据库记录数、大小、WAL页数等关键指标
- **自动维护监控**: 显示系统自动执行的VACUUM、REINDEX、ANALYZE等维护操作状态（完全自动化，无手动操作）
- **性能分析**: 分析数据库性能并提供优化建议
- **智能建议**: 基于当前状态自动生成优化建议

### 用户体验
- **实时更新**: 支持自动刷新统计信息
- **进度指示**: 详细的操作进度和预计时间显示
- **错误处理**: 友好的错误提示和解决建议
- **确认对话框**: 危险操作的确认机制
- **性能监控**: 实时监控组件性能和API响应时间

## 组件结构

```
DatabaseOptimization/
├── index.jsx                 # 主组件
├── hooks.js                  # 状态管理和业务逻辑
├── utils.js                  # 工具函数
├── StatisticsCards.jsx       # 统计卡片组件
├── OperationPanels.jsx       # 操作面板组件
├── MaintenanceStatusPanel.jsx # 维护状态面板组件
├── PerformancePanel.jsx      # 性能监控面板
├── usePerformanceMonitor.js  # 性能监控hooks
└── README.md                 # 文档
```

## API 接口

### 后端API调用
- `get_database_statistics`: 获取数据库统计信息
- `get_maintenance_status`: 获取自动维护状态（只读）
- `analyze_database_performance_command`: 性能分析

### 数据结构

#### 统计信息 (DatabaseStats)
```typescript
interface DatabaseStats {
  total_records: number;        // 记录总数
  database_size_mb: number;     // 数据库大小(MB)
  index_count: number;          // 索引数量
  wal_mode_enabled: boolean;    // WAL模式状态
  wal_pages: number;           // WAL页数
  type_stats: Record<string, number>;  // 内容类型统计
  app_stats: Record<string, number>;   // 应用使用统计
}
```

#### 维护结果 (MaintenanceResult)
```typescript
interface MaintenanceResult {
  vacuum_completed: boolean;    // VACUUM操作完成状态
  reindex_completed: boolean;   // REINDEX操作完成状态
  analyze_completed: boolean;   // ANALYZE操作完成状态
  records_cleaned: number;      // 处理的记录数
  size_before_mb: number;       // 维护前大小
  size_after_mb: number;        // 维护后大小
  duration_ms: number;          // 操作耗时
  is_automatic: boolean;        // 是否为自动维护
  next_maintenance: string;     // 下次维护时间
  last_maintenance: string;     // 上次维护时间
  maintenance_interval: number; // 维护间隔(毫秒)
  auto_maintenance_enabled: boolean; // 自动维护是否启用
}
```

#### 性能分析结果 (PerformanceAnalysis)
```typescript
interface PerformanceAnalysis {
  score: number;                // 性能评分(0-100)
  grade: string;                // 性能等级
  issues: string[];             // 发现的问题
  recommendations: string[];     // 优化建议
}
```

## 使用方法

### 基本使用
```jsx
import DatabaseOptimization from './components/DatabaseOptimization';

function App() {
  return (
    <div>
      <DatabaseOptimization />
    </div>
  );
}
```

### 自定义配置
组件内部使用hooks管理状态，支持以下配置：

- **自动刷新**: 每30秒自动刷新统计信息
- **重试机制**: API调用失败时自动重试3次
- **进度监控**: 实时显示操作进度和预计时间
- **性能监控**: 监控组件渲染性能和API响应时间

## 性能优化

### 已实现的优化
1. **组件拆分**: 将大组件拆分为多个小组件，提高可维护性
2. **状态管理**: 使用自定义hooks集中管理状态
3. **防抖处理**: 对消息显示进行防抖优化
4. **虚拟化**: 大数据列表支持虚拟滚动
5. **内存监控**: 实时监控内存使用情况
6. **API优化**: 记录和分析API响应时间

### 性能指标
- **渲染时间**: 目标 < 50ms
- **API响应**: 目标 < 2秒
- **内存使用**: 建议 < 100MB
- **组件更新**: 避免不必要的重渲染

## 错误处理

### 错误类型
1. **网络错误**: 连接失败、超时等
2. **权限错误**: 数据库访问权限不足
3. **业务错误**: 参数验证失败等
4. **系统错误**: 数据库锁定、磁盘空间不足等

### 错误恢复
- **自动重试**: 网络错误和临时性错误
- **用户确认**: 需要用户干预的错误
- **友好提示**: 提供具体的解决建议
- **错误上报**: 记录错误时间和详细信息

## 测试

### 单元测试
- API调用函数测试
- 工具函数测试
- 状态管理逻辑测试
- 错误处理机制测试

### 集成测试
- 前后端API集成测试
- 用户交互流程测试
- 错误场景测试
- 性能测试

### 运行测试
```bash
# 运行所有测试
pnpm test

# 运行特定测试文件
pnpm test DatabaseOptimization

# 运行测试并生成覆盖率报告
pnpm test --coverage
```

## 开发指南

### 添加新功能
1. 在`utils.js`中添加工具函数
2. 在`hooks.js`中添加状态和业务逻辑
3. 创建新的子组件或更新现有组件
4. 添加相应的测试用例
5. 更新文档

### 代码规范
- 使用TypeScript类型注释
- 遵循React Hooks规范
- 保持组件单一职责
- 添加适当的注释
- 使用语义化的变量名

### 调试技巧
1. 使用性能监控面板查看实时指标
2. 检查浏览器控制台的错误信息
3. 使用React DevTools分析组件状态
4. 监控网络请求的响应时间
5. 查看内存使用情况

## 更新日志

### v2.0.0 (当前版本)
- ✅ 修复API调用不匹配问题
- ✅ 增强错误处理和用户反馈
- ✅ 实现智能优化建议系统
- ✅ 添加性能监控功能
- ✅ 优化组件结构和代码组织
- ✅ 完善测试覆盖率

### v1.0.0 (初始版本)
- 基础的数据库统计信息显示
- 简单的维护功能
- 基本的错误处理

## 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。