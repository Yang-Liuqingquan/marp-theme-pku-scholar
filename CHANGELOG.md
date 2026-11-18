# Changelog

版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。主题的「公开 API」指：

- 主题名 `pku-scholar`；
- 页面骨架 `div.titlePage` / `div.sectionPage` / 正文页首个 `##`；
- 工具类 `dense` / `tight` / `xs` / `refs` / `fig` 与 `<div class="theorem">`；
- 设计令牌 `--pku-serif` / `--pku-kai` / `--pku-ink` / `--pku-accent` / `--pku-logo`。

## 1.0.0 — 2026-11-18

首个版本。

### 特性

- 继承 Marp 默认主题（`@import 'default'`），只覆盖需要改的部分。
- 三种页面骨架：封面页、小节页、正文页（标题钉在左上角，正文从标题下方开始）。
- 工具类 `.dense` / `.tight` / `.xs` / `.refs` / `.fig`，全部用 `:where()` 压低优先级，讲稿里的 `<style>` 可直接覆盖。
- 设计令牌：标题字体、正文字体、主色、校徽都可在讲稿里覆盖。
- 默认字体：标题用霞鹜文楷（`'霞鹜文楷'` / `'LXGW WenKai'`），引文与作者行用寒蝉正楷体（`'ChillKai'`），回退到系统楷体。
- 校徽是讲稿同级的图片文件（`images/pku-logo.png`），替换文件即生效，没有额外构建步骤。
- 表格、公式（KaTeX）、代码块、引用、定理框都已适配 1280×720 画布。
- `npm run check`：主题自检。
- `examples/demo.md`：12 页模板，覆盖三种骨架与全部工具类；示例围绕虚构的城市热岛研究展开，不复用任何个人学科或院系信息。
- GitHub Pages 工作流：推送后构建并发布 demo。
