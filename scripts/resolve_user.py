# -*- coding: utf-8 -*-
"""解析抖音用户输入为 sec_uid。
用法: python resolve_user.py <v.douyin.com短链 | 完整分享链接 | sec_uid>
输出: JSON 一行 {"sec_uid": "...", "source": "short_link|direct"}
"""
import json, re, sys, urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")

SEC_UID_RE = re.compile(r'(MS4wLjABAAAA[A-Za-z0-9_-]{20,})')


def resolve(arg: str) -> dict:
    arg = arg.strip().strip('"\'')
    m = SEC_UID_RE.search(arg)
    if m:
        return {"sec_uid": m.group(1), "source": "direct"}
    # 视为短链：补全协议并跟随 302
    if not arg.startswith("http"):
        code = arg.split("v.douyin.com/")[-1].strip("/ ")
        arg = f"https://v.douyin.com/{code}/"
    req = urllib.request.Request(arg, headers={"User-Agent": UA}, method="HEAD")
    opener = urllib.request.build_opener(_NoRedirect())
    try:
        resp = opener.open(req, timeout=30)
        loc = resp.headers.get("Location", "") or resp.url
    except _RedirectCaught as e:
        loc = e.location
    m = SEC_UID_RE.search(loc or "")
    if m:
        return {"sec_uid": m.group(1), "source": "short_link"}
    raise SystemExit(f"ERROR: 无法从输入中解析 sec_uid，Location={loc!r}")


class _RedirectCaught(Exception):
    def __init__(self, location):
        super().__init__(location)
        self.location = location


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise _RedirectCaught(newurl)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("用法: resolve_user.py <分享链接/短链码/sec_uid>")
    print(json.dumps(resolve(sys.argv[1]), ensure_ascii=False))
