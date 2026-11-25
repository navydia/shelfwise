// "Shelfwise" with the i's dot drawn as a Butter shelf tag (see .wm-i in app.css).
// Pass edge = false on dark backgrounds, where the hairline edge is not wanted.
export function wordmarkHtml(size = 24, edge = true) {
  return `<span class="wm${edge ? ' wm-edge' : ''}" style="font-size:${size}px" role="img" aria-label="Shelfwise">Shelfw<span class="wm-i" aria-hidden="true">ı</span>se</span>`;
}
