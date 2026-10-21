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

### 识别流程可靠性

- 上传前后统一限制为 6 MiB；服务端对 multipart 总大小（额外允许 64 KiB 字段开销）和读取时间（30 秒）设限，不依赖 Content-Length。
- 校验空文件、实际图片格式、声明 MIME、识别参数和图片尺寸。支持 PNG/JPEG/BMP/WebP，上传图每边至少 15 像素、单边最多 16384 像素、总像素不超过 3200 万；预处理会进一步完整解码并将识别图限制到每边 15–4096 像素。
- 百度访问凭证请求最多 10 秒，OCR 请求和解析结果下载每次最多 30 秒，覆盖响应体读取；HTTP 错误、非 JSON 和网络异常会结束本次识别。仅对明确的 QPS 限流做有限重试，额度耗尽直接失败，避免重复提交可能已经计费的请求。
- 每轮识别从创建/重试起最多 5 分钟，截止时间存入 SQLite。运行中的请求支持取消；查看列表、详情或状态、以及重试时会将过期任务标为失败。深度解析在无人查看或服务停机时不运行常驻计时器，下次访问时判定过期。
- 重试采用独立 attemptId，处理中返回 HTTP 409；结果与版本写入通过事务检查本轮身份、状态和截止时间，防止旧请求覆盖新结果或重复创建初始版本。
- 前端请求最多等待 60 秒，状态轮询不叠加并显示查询错误。上传请求超时后先查看历史记录，服务端可能已经创建任务。

新增迁移 `20261021120000_task_deadline`，上线需执行 `npm run db:deploy`（`npm start` 已自动执行）。迁移保留现有任务与结果；没有截止时间的旧任务按创建时间加 5 分钟判定。进程重启后未完成的通用/表格任务会在到期后标为失败，用户可重试；当前没有持久化后台队列自动重跑。

### 图片预处理

新上传图片自动经过 `sharp` 预处理，再创建识别任务：

- 根据 EXIF 方向信息旋转或镜像，不识别没有方向信息的视觉倾斜。
- 超出 4096 像素时等比例缩小，不放大小图；极端长宽比导致短边不足 15 像素时拒绝上传。
- 透明区域铺白底，转换为 sRGB，重新编码时去除 EXIF 等元数据。JPEG 使用质量 90、4:4:4 采样；PNG、BMP、WebP 优先生成无损 PNG，超过 2 MiB 时转 JPEG 90。若仍超过 6 MiB，依次尝试质量 85、80，仍超限则拒绝；输出不保证小于原文件。
- 保持上传 6 MiB 上限；不支持多帧图片。BMP 使用 `bmp-js` 解码，支持常见 BITMAPINFOHEADER、无压缩的 1/4/8/24/32 位格式，其他编码提示转为 PNG/JPG。
- 原图与识别图一起保存在 `storage/images`。Task.originalImagePath 指向原文件，Task.preprocessing 记录版本、输入输出尺寸、字节数与处理操作。两份文件在任务删除时一并清理。
- OCR、归一化坐标及编辑器默认图片共用 Task.imagePath。编辑器提供原图下载；`GET /api/tasks/{id}/image?variant=original` 返回未修改的原文件。旧任务不自动重处理，保留原有图片与坐标。

部署需要安装运行依赖 `sharp`、`bmp-js`，并执行迁移 `20261021150000_image_preprocessing`（`npm start` 自动执行）。迁移只新增可空字段，保留现有任务。预处理没有加入自动裁边、透视校正、去模糊或对比度增强；是否提高识别准确率仍需真实 OCR 对照评测。

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
