#!/usr/bin/env node
/**
 * 主题自检：把主题的几条硬约束写成守卫。
 *
 *   node scripts/check-theme.mjs
 *
 * 守的是「单文件主题、继承默认主题、固定画布、变量可覆盖、校徽是外部图片文件」，
 * 任何一条被破坏都会让主题在别人的机器上悄悄变形，所以放在 CI 与 npm run build 前。
 */

import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_PATH = path.join(ROOT, 'themes', 'pku-scholar.css');
const EXAMPLE_DIR = path.join(ROOT, 'examples');
const MAX_LINES = 600;
const REQUIRED_TOKENS = ['--pku-serif', '--pku-kai', '--pku-ink', '--pku-accent', '--pku-logo'];

const raw = await readFile(CSS_PATH, 'utf8');
const problems = [];
const fail = (message) => problems.push(message);

// 结构检查前先去掉注释（以及字符串字面量），避免把注释里的示例当成真代码
const noComments = raw.replace(/\/\*[\s\S]*?\*\//g, '');
const structural = noComments
  .replace(/'(?:[^'\\]|\\.)*'/g, "''")
  .replace(/"(?:[^"\\]|\\.)*"/g, '""');

const occurrences = (haystack, needle) => haystack.split(needle).length - 1;

// 1. 元数据：只能有一个 @theme，只能声明一种画布尺寸
const themeCount = occurrences(raw, '@theme');
if (themeCount !== 1) fail(`@theme 应恰好出现 1 次，实际 ${themeCount} 次`);
if (!raw.includes('@size 16:9 1280px 720px')) fail('缺少 @size 16:9 1280px 720px');
if (raw.includes('@size 4:3')) fail('不要声明 4:3：画布尺寸是写死的 1280×720');

// 2. 继承：只用 @import 'default' 一次，且必须写在所有规则之前
const importCount = occurrences(noComments, "@import 'default'");
if (importCount !== 1) fail(`@import 'default' 应恰好 1 次，实际 ${importCount} 次`);
else if (noComments.indexOf("@import 'default'") > noComments.indexOf('{')) {
  fail("@import 'default' 必须写在第一条规则之前");
}

// 3. 不复制默认主题的实现
if (noComments.includes('.markdown-body')) {
  fail('出现了 .markdown-body：默认主题已经通过 @import 提供 GitHub Markdown 排版');
}
if (raw.includes('sourceMappingURL')) fail('出现了 sourceMappingURL：说明又粘进了一段编译产物');

// 4. 优先级与单位
if (noComments.includes('!important')) {
  fail('出现了 !important：需要压过默认主题时请用变量、选择器或 :where()');
}
const viewportUnits = structural.match(/[\d.]+(?:vh|vw|vmin|vmax)\b/g);
if (viewportUnits) {
  fail(`出现了视口单位 ${[...new Set(viewportUnits)].join('、')}：画布固定 1280×720，HTML 预览与 PDF 会不一致`);
}
if (/@media[^{]*max-width/.test(structural)) {
  fail('出现了 @media (max-width: …) 响应式断点：固定画布下它们是死代码');
}

// 5. 结构完整性
let depth = 0;
for (const char of structural) {
  if (char === '{') depth += 1;
  else if (char === '}') depth -= 1;
  if (depth < 0) break;
}
if (depth !== 0) fail(`花括号不配对（结束时差 ${depth} 个）`);

// 6. 变量：用到的都要声明，关键令牌不能少
const declared = new Set([...raw.matchAll(/(--pku-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const used = new Set([...raw.matchAll(/var\((--pku-[a-z0-9-]+)/g)].map((m) => m[1]));
for (const name of used) {
  if (!declared.has(name)) fail(`引用了未声明的变量 ${name}`);
}
for (const name of REQUIRED_TOKENS) {
  if (!declared.has(name)) fail(`缺少设计令牌 ${name}`);
}

// 7. 校徽：必须是讲稿同级的图片文件，不能内联；示例目录里必须真的能解析到
if (raw.includes('data:image')) {
  fail('出现了 data:image：校徽要作为图片文件提供，换图只需覆盖文件，不要内联进 CSS');
}
const logoDecl = raw.match(/--pku-logo:\s*([^;]+);/);
if (!logoDecl) {
  fail('找不到 --pku-logo 的声明');
} else {
  const value = logoDecl[1].trim();
  if (value !== 'none') {
    const urlMatch = value.match(/^url\(\s*(['"]?)([^'")]+)\1\s*\)$/);
    if (!urlMatch) {
      fail(`--pku-logo 只能是 none 或 url('...')，实际是 ${value}`);
    } else {
      const logoPath = urlMatch[2];
      if (/^[a-z][a-z0-9+.-]*:/i.test(logoPath) || path.isAbsolute(logoPath)) {
        fail(`--pku-logo 必须是相对讲稿目录的路径，实际是 ${logoPath}`);
      } else {
        const resolved = path.resolve(EXAMPLE_DIR, logoPath);
        const inside = !path.relative(EXAMPLE_DIR, resolved).startsWith('..');
        if (!inside) {
          fail(`--pku-logo 指向了示例目录之外：${logoPath}`);
        } else {
          try {
            await access(resolved);
          } catch {
            const shown = path.relative(ROOT, resolved).split(path.sep).join('/');
            fail(`--pku-logo 指向的文件不存在：${shown}`);
          }
        }
      }
    }
  }
}

// 8. 规模：主题文件的复杂度上限
const lines = raw.split(/\r?\n/).length - 1;
if (lines > MAX_LINES) fail(`主题文件 ${lines} 行，超过 ${MAX_LINES} 行上限`);

// 9. 字体：只能经由令牌声明（换字体是改一处的活），回退栈要落到通用 family
for (const match of noComments.matchAll(/font-family\s*:\s*([^;}]+)/g)) {
  const value = match[1].trim();
  if (!value.startsWith('var(--pku-')) {
    fail(`font-family 只能写 var(--pku-serif) / var(--pku-kai)，实际是 ${value}`);
  }
}
const GENERIC_FAMILIES = ['serif', 'sans-serif', 'monospace', 'cursive', 'system-ui'];
for (const token of ['--pku-serif', '--pku-kai']) {
  const declaration = raw.match(new RegExp(`${token}:\\s*([^;]+);`));
  if (!declaration) continue; // 缺令牌由 REQUIRED_TOKENS 负责报
  const fallback = declaration[1].trim().split(',').pop().trim();
  if (!GENERIC_FAMILIES.includes(fallback)) {
    fail(`${token} 的回退栈要以通用 family 结尾，实际结尾是 ${fallback}`);
  }
}

// 结果
if (problems.length > 0) {
  console.error(`✗ themes/pku-scholar.css 未通过自检（${problems.length} 项）：`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const kb = (Buffer.byteLength(raw, 'utf8') / 1024).toFixed(1);
console.log(`✓ themes/pku-scholar.css 通过自检：${lines} 行 / ${kb} KB`);
