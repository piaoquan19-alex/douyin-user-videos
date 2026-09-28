# -*- coding: utf-8 -*-
"""批量下载抖音用户全部视频 mp4（只下载视频，不保存统计数据/元数据）。
用法: python batch_download.py <目录（内含 _manifest.json）>
依赖: douyin-video-download 技能的 scripts/fetch_video.py
行为: 跳过图文帖；跳过已成功项（断点续传）；失败自动重试最多 3 轮；
      每次 5~10 秒随机间隔防限流；fetch_video.py 写出的 meta.json 每次成功后立即删除。
"""
import json, os, random, shutil, subprocess, sys, time

PY = sys.executable
FETCH_CANDIDATES = [
    os.path.join(os.path.expanduser("~"), ".workbuddy", "skills", "douyin-video-download", "scripts", "fetch_video.py"),
    os.path.join(os.path.dirname(__file__), "..", "..", "douyin-video-download", "scripts", "fetch_video.py"),
]


def find_fetch():
    for p in FETCH_CANDIDATES:
        if os.path.exists(p):
            return p
    raise SystemExit("ERROR: 未找到 douyin-video-download 技能的 fetch_video.py")


FETCH = find_fetch()


def log(outdir, msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    with open(os.path.join(outdir, "_progress.log"), "a", encoding="utf-8") as f:
        f.write(line + "\n")


def is_video_post(it):
    # 图文/图片帖：has_images 或典型图文 aweme_type（68/150/163 等）
    return not it.get("has_images") and it.get("aweme_type") not in (68, 150, 163)


def load_progress(outdir):
    p = os.path.join(outdir, "_progress.json")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return {"done": [], "failed": []}


def save_progress(outdir, prog):
    with open(os.path.join(outdir, "_progress.json"), "w", encoding="utf-8") as f:
        json.dump(prog, f, ensure_ascii=False, indent=1)


def run_round(outdir, todo, pass_no):
    prog = load_progress(outdir)
    fails = []
    for i, wid in enumerate(todo, 1):
        log(outdir, f"[第{pass_no}轮 {i}/{len(todo)}] {wid}")
        try:
            r = subprocess.run([PY, FETCH, wid, "--outdir", outdir],
                               capture_output=True, text=True, timeout=900,
                               encoding="utf-8", errors="replace")
            out = (r.stdout or "") + (r.stderr or "")
            if r.returncode == 0 and "下载完成" in out:
                prog["done"].append(wid)
                if wid in prog["failed"]:
                    prog["failed"].remove(wid)
                # 只留视频：删除下载脚本附带写出的元数据
                meta = os.path.join(outdir, "meta.json")
                if os.path.exists(meta):
                    os.remove(meta)
                log(outdir, f"  OK {wid}")
            else:
                fails.append(wid)
                if wid not in prog["failed"]:
                    prog["failed"].append(wid)
                tail = (out.strip().splitlines() or ["no output"])[-1]
                log(outdir, f"  FAIL {wid}: {tail[:120]}")
        except Exception as e:
            fails.append(wid)
            if wid not in prog["failed"]:
                prog["failed"].append(wid)
            log(outdir, f"  ERROR {wid}: {e}")
        save_progress(outdir, prog)
        time.sleep(random.uniform(5, 10))
    return fails


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
    mf = os.path.join(outdir, "_manifest.json")
    if not os.path.exists(mf):
        raise SystemExit(f"ERROR: 未找到 {mf}，请先运行 enum_user.js")
    with open(mf, encoding="utf-8") as f:
        data = json.load(f)

    skipped, todo = [], []
    for it in data["items"]:
        if not is_video_post(it):
            skipped.append(it["aweme_id"])
        elif it["aweme_id"] not in load_progress(outdir)["done"]:
            todo.append(it["aweme_id"])
    if skipped:
        with open(os.path.join(outdir, "_skipped.txt"), "w", encoding="utf-8") as f:
            f.write("\n".join(skipped))
        log(outdir, f"跳过图文帖 {len(skipped)} 个: {skipped}")

    log(outdir, f"=== 开始：待下载 {len(todo)}，已完成 {len(load_progress(outdir)['done'])} ===")
    for pass_no in range(1, 4):
        fails = run_round(outdir, todo, pass_no)
        if not fails:
            break
        if fails and pass_no < 3:
            todo = fails
            time.sleep(15)
    prog = load_progress(outdir)
    log(outdir, f"=== 结束：成功 {len(prog['done'])}，仍失败 {prog['failed']} ===")


if __name__ == "__main__":
    main()
