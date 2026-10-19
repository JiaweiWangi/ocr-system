# 多版式 OCR 文档识别与在线处理系统

百度在线实习课题：面向拍照文档、表格截图、票据单据、试卷图片、宣传海报、扫描件等版式的在线 OCR 系统，打通 **图片输入 → OCR 识别 → 结构化处理 → 在线编辑 → 结果下载** 完整流程。

## 技术栈

- **框架**：Next.js 16（App Router，全栈 TypeScript）
- **UI**：Tailwind CSS 4 + shadcn/ui
- **OCR**：百度智能云 REST API（通用文字识别 / 表格识别 V2 / 文档解析）
- **数据**：SQLite + Prisma 7（better-sqlite3 驱动适配器）
- **导出**：docx / exceljs（合并单元格支持 rowspan/colspan）
- **测试**：vitest（tableMath 坐标数学纯函数）

## 快速开始

环境要求：Node.js 24.x。部署平台也请使用 Node.js 24。

```bash
npm install
npx prisma migrate dev        # 初始化 SQLite（首次）
npm run dev                   # 默认 BAIDU_MOCK=1，使用 fixtures 回放，不消耗百度额度
```

打开 http://localhost:3000。

### 生产部署

安装命令使用 `npm ci --include=dev`，构建命令使用 `npm run build`，启动命令使用 `npm start`。
启动时会先执行 `prisma migrate deploy`，在运行环境的数据库中创建尚未建立的表；迁移失败则不会启动应用。

`DATABASE_URL` 可配置 SQLite 文件位置，例如 `file:/data/ocr.db`。迁移与应用使用相同路径；
未设置时使用项目根目录的 `dev.db`，相对路径也以项目根目录为基准。
生产环境应将数据库所在目录挂载为持久化磁盘，并持久化上传图片目录 `storage/images`。

如果平台覆盖了启动命令，请改为 `npm start`；仅执行 `next start` 会跳过迁移。

### 接入真实百度 API

1. 注册[百度智能云](https://console.bce.baidu.com/ai/#/ai/ocr/overview)，创建「文字识别」应用，拿到 API Key / Secret Key
2. 在 `.env.local` 中填入：

```env
BAIDU_API_KEY=你的Key
BAIDU_SECRET_KEY=你的Secret
BAIDU_MOCK=0
```

3. 重启 dev server

> 免费额度（个人认证）：通用 1000 次/月、高精度 500 次/月、表格 500 次/月、文档解析 200 页/月。日常开发请保持 `BAIDU_MOCK=1`，真实调用集中冒烟和答辩演示。

## 三种识别模式

| 模式 | 引擎 | 适用版式 | 特点 |
|---|---|---|---|
| 通用 | 通用文字识别（标准/高精度） | 拍照文档、扫描件、海报 | 同步，段落分组归一化 |
| 表格 | 表格识别 V2 | 表格截图、票据 | 同步，还原合并单元格，附带表外文字 |
| 深度 | 文档解析 | 试卷、多栏、图文混排 | 异步提交+轮询，完整版面分类（标题/段落/表格/图片/印章/公式） |

## 核心设计

- **统一 OcrDocument schema**（`src/lib/normalize/types.ts`）：三个引擎输出全部归一化为一种块结构（heading/paragraph/table/figure/seal/formula/keyValue），前端编辑器与导出器只面对这一种格式
- **三层数据分离**：RawResult（百度原始响应）→ 归一化结果 → DocumentVersion（用户编辑版本快照）。归一化有 bug 可用原始数据重放，不重复消耗额度
- **poll-on-demand**：深度模式无常驻定时器，前端查状态时按需查询百度（≥3s 节流），dev server 重启自动恢复
- **tableMath 纯函数**（`src/lib/normalize/tableMath.ts`）：合并单元格的增删行列坐标平移全部纯函数化，vitest 覆盖边界用例
- **QPS 防护**：全局串行队列（免费档 QPS=2）+ 额度/token 错误自动重试

## 项目结构（对应任务书三子课题）

```
子课题1 图片采集与识别流程   → src/lib/baidu/ + src/lib/pipeline/ + src/components/upload/
子课题2 版面分析与结构化提取 → src/lib/normalize/ + src/lib/kie/ + fixtures/
子课题3 在线编辑与导出页面   → src/components/editor/ + src/lib/export/ + src/app/(history)
```

## 常用命令

```bash
npm run dev        # 开发（mock 模式）
npm run build      # 生产构建
npm test           # vitest 单测（tableMath 等）
npx prisma studio  # 数据库可视化（答辩演示历史记录很好用）
```

## fixtures 回放

`BAIDU_MOCK=1` 时按上传文件名匹配 `fixtures/{engine}-{文件名去扩展名}.json`，找不到则回退 `{engine}-default.json`。真实调用一次后，可把百度响应（Prisma Studio 里 RawResult.payload）存为 fixture 供反复调试。
