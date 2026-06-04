(() => {
  if (document.getElementById("bili-sync-btn")) return;

  const getPlayUrl = () => {
    const html = document.documentElement.innerHTML;
    const match = html.match(/__playinfo__\s*=\s*({[\s\S]*?})\s*(?:<\/script>|;\s*var|;\s*<\/script>)/);
    if (!match) throw new Error("missing __playinfo__");
    const data = JSON.parse(match[1])?.data || {};
    return data?.durl?.[0]?.url
      || data?.dash?.video?.[0]?.baseUrl
      || data?.dash?.video?.[0]?.base_url
      || "";
  };

  const btn = document.createElement("button");
  btn.id = "bili-sync-btn";
  btn.textContent = "复制直链用于同步";
  btn.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:99999;padding:10px 14px;border:0;border-radius:10px;background:#fb7299;color:#fff;cursor:pointer;";
  btn.onclick = async () => {
    const prev = btn.textContent;
    try {
      const url = getPlayUrl();
      if (!url) throw new Error("empty url");
      await navigator.clipboard.writeText(url);
      btn.textContent = "已复制 ✔";
    } catch {
      btn.textContent = "提取失败";
    }
    setTimeout(() => {
      btn.textContent = prev;
    }, 2000);
  };

  document.body.appendChild(btn);
})();
