# douyin-user-videos

WorkBuddy Skill：批量下载指定抖音用户的**全部视频**（仅 mp4，不含点赞/评论等统计数据）。

## 功能

- 支持三种输入：视频分享短链（`v.douyin.com/...`）、用户主页链接、sec_uid
- 通过用户分享页滚动加载，枚举主页全部作品（登录态不足时自动弹出浏览器等待扫码登录，登录态可复用）
- 逐个下载全部视频 mp4，断点续传、失败自动重试 3 轮、限速防风控
- 图文帖自动跳过；每个视频附带元数据供断点续传使用，最终自动清理
- 输出目录：`<桌面>/抖音下载/<用户昵称>_<抖音号>/`（可自定义）

## 组成

| 文件 | 作用 |
|---|---|
| `SKILL.md` | Skill 说明：触发条件、执行流程、坑点清单 |
| `scripts/resolve_user.py` | 短链/链接 → 真实用户 sec_uid |
| `scripts/enum_user.js` | Playwright + Edge 枚举全部作品 ID 与标题 |
| `scripts/batch_download.py` | 批量下载（去重、续传、重试、限速） |

## 依赖

- Windows + Microsoft Edge（其他平台可自行改浏览器路径）
- Python 3.10+、Node.js 18+
- Node 需安装 `playwright-core`（用本机 Edge 驱动，无需下载浏览器）：
  ```bash
  npm install playwright-core
  ```

## 使用（WorkBuddy 内）

对 WorkBuddy 说：**"下载抖音用户 xxx 的全部视频"** 并附上主页分享链接即可自动执行完整流程。

## 声明

仅供个人学习/备份使用，请勿用于商业用途；下载内容版权归原作者所有，请遵守抖音服务条款，控制请求频率。
