# 测试样张套件

## 子课题 1 基准样本集

新增 [dataset/README.md](dataset/README.md)：六类、30 个独立合成案例、60 张图片，配有标准文本、来源说明、类别清单和校验工具。可从 [样本索引](dataset/CATALOG.md) 选择图片。

新样本尚未调用真实 OCR，也没有配套响应 fixtures；Mock 回放不能用于检验新图片的识别效果。真实拍照和扫描采集另见 [采集计划](dataset/COLLECTION.md)，不与合成样本混计。

## 原有四张演示样张

以下样张有配套 fixtures（`fixtures/{engine}-{文件名去扩展名}.json`），
显式设置 `BAIDU_MOCK=1` 后，使用已配备 fixture 的引擎回放，不消耗百度额度。
通用模式回放时选择标准精度；当前未提供 `accurate-*` 高精度 fixtures。
回放测试见 `src/lib/kie/samples.replay.test.ts` 与 `extract.invoice-replay.test.ts`。

| 样张 | 模式 | 版式特征 | 考察点 |
|---|---|---|---|
| 发票测试.png | 通用 / 表格 | 数电发票 | 20 位发票号、明细表、价税合计；金额（含 4 位无逗号）、日期、手机号 |
| 海报测试.png | 通用 | 大标题、大段间距 | 段落间距分组（groupByGap）；邮箱、URL、手机号、日期 |
| 收据测试.png | 表格 | 表内合并单元格（整行抬头 + 合计跨列） | 千分位 / 「元」后缀 / 4 位无逗号金额回归；表外文字（编号/日期/落款）不进表格 |
| 试卷测试.png | 深度 | 标题层级 + 公式 + 得分表 | doc_title/title2 层级映射、formula 只读块、matrix 合并格（整行 + 跨列）、表格内身份证号 |

## 使用

1. 显式配置 `BAIDU_MOCK=1` 后运行 `npm run dev`
2. 首页上传 `samples/` 下的样张，选择对应模式
3. 深度模式（试卷）提交后前端轮询 3 次左右完成（模拟 pending → running → success）

## 断言的负向用例

- 收据单价列的裸数字（`1,234.56`、`280`）不误报为金额——必须有 `¥` 前缀或 `元` 后缀
- 收据编号 `NO.00881234`（8 位数字）不误报为发票号——无标签的 8 位数字不命中
- 试卷身份证号内部的数字子串不误报为手机号（前后均为数字时 lookbehind/lookahead 拦截）
