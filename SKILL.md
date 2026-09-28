---
name: douyin-user-videos
description: 批量下载抖音用户主页的全部视频 mp4（不含点赞/评论等统计数据、不保存元数据）。当用户给出抖音号、主页分享链接、v.douyin.com 短链并要求"下载该用户的全部视频/作品"时使用。自动解析用户、处理登录、滚动枚举全部作品、限速批量下载到桌面新建的"抖音下载"文件夹，支持断点续传与失败重试。
agent_created: true
---

# 抖音用户视频批量下载

把某个抖音用户主页下的全部**视频**下载为本地 mp4。只下载视频文件本身，不保存点赞/评论等统计数据和每个视频的元数据 JSON。

## 前置依赖（首次使用先检查）

1. `douyin-video-download` 技能已安装（提供单视频下载脚本 `fetch_video.py`）
2. Node.js 依赖 `playwright-core`（用本机 Edge/Chrome 驱动，无需下载浏览器）。安装位置任选其一即可，脚本会自动查找：`NODE_PATH` 指向的目录、`%USERPROFILE%\.workbuddy\binaries\node\workspace`、`~`、本技能目录
   ```bash
   npm install playwright-core
   ```
3. 本机 Edge 或 Chrome（脚本自动探测）
4. Python 3.10+ 与 Node.js 18+（用本机 `python` / `node` 即可）

## 执行流程（严格按顺序）

### 第 1 步：解析用户 sec_uid

```bash
python <本技能>\scripts\resolve_user.py "<用户输入的链接或短链码>"
```

- 输出 `{"sec_uid": "..."}`
- 用户只给抖音号（如 `1234567890`）时**无法解析**：抖音搜索页有验证码，匿名不可搜。请用户在抖音 App 中 打开该用户主页 → 分享 → 复制链接，再交给本脚本

### 第 2 步：枚举全部作品

```bash
node <本技能>\scripts\enum_user.js <sec_uid> --out "<输出目录>"
```

- 输出目录建议：`%USERPROFILE%\Desktop\抖音下载\<暂定名>`

- 脚本自动：无头尝试枚举 → 数量不足（<30 或少于主页"作品"数）时**弹出可见浏览器等待用户扫码登录**（最长 10 分钟）→ 登录态存入 `_login_profile\` 供下次复用
- 输出目录如不存在会自动创建；`user.json`（昵称/抖音号）与 `_manifest.json`（仅 id/标题/类型）写入其中
- 枚举完成后按 `user.json` 把目录重命名为 `<昵称>_<抖音号>`（昵称含非法字符时清洗）

### 第 3 步：批量下载

```bash
python <本技能>\scripts\batch_download.py "<输出目录>"
```

- 循环调用 `douyin-video-download` 的 `fetch_video.py`，仅保留 mp4（脚本每次成功后自动删除 meta.json）
- 图文帖自动跳过并记录 `_skipped.txt`；失败自动重试最多 3 轮；断点续传（重跑跳过已成功项）
- 每个 5~10 秒随机间隔防限流；**用 Bash `run_in_background` 运行**，完成后汇总

### 第 4 步：校验与汇报

- 对比 mp4 数量与 `_manifest.json` 的视频帖数量、总磁盘占用
- 用 `present_files` 展示输出目录与代表视频

## 关键坑

1. **不要绕过脚本直接 curl 抖音页面/接口**：`aweme/post` 接口需要浏览器内签名（a_bogus），直接请求返回 shark_fail；分享页纯抓取只有占位文案
2. **匿名枚举一定不完整**（通常只给 15~18 条），必须登录后滚动枚举
3. 分享页 `play_addr` 直链实际是 M4A 音频，不能用于下载视频——必须走 `fetch_video.py` 渲染分享页取直链
4. 渲染结果过短（<5000 字符）是网络/风控问题，重试即可；`aweme_type 68/150/163` 或 `has_images` 的条目是图文帖，无视频流
5. 下载耗时约 1 分钟/个，务必后台运行；中断后重跑即可续传

## 安全与隐私边界

- 仅访问 douyin.com / iesdouyin.com / douyinvod.com 域名；无第三方接口、无数据外发
- 登录 profile 仅存于 `~\.workbuddy\skills\douyin-user-videos\_login_profile\`，用户可随时删除
- 文件只写入指定输出目录；下载内容供个人离线观看，不用于二次分发
