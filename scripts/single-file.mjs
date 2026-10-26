// Usage: node scripts/single-file.mjs <out.html>
// Run `npm run build:single` first. Writes the app as one HTML fragment (title, style, root, script).
import { readFileSync, writeFileSync } from 'node:fs';

const out = process.argv[2];
if (!out) throw new Error('usage: node scripts/single-file.mjs <out.html>');
const js = readFileSync('dist-single/app.js', 'utf8');
const css = readFileSync('dist-single/app.css', 'utf8');
if (/<\/script/i.test(js)) throw new Error('bundle contains </script; cannot inline safely');

const html = `<title>Saathi</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Noto+Sans+Devanagari:wght@400;500&display=swap" rel="stylesheet">
<style>
${css}
</style>
<div id="root"></div>
<script>
${js}
</script>
`;
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
