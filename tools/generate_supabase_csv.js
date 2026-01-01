const fs = require('fs');
const path = require('path');

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  const needs = /[",\n\r]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needs ? `"${escaped}"` : escaped;
}

function writeCsv(filePath, headers, rows) {
  const lines = [];
  lines.push(headers.map(csvEscape).join(','));
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

function parsePriceToNumeric(raw) {
  if (raw === null || raw === undefined) return 0;
  const s = String(raw).trim();
  const num = Number(s.replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) ? num : 0;
}

function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const inputPath = path.join(projectRoot, 'assets', 'data.json');
  const outDir = path.join(projectRoot, 'exports');

  if (!fs.existsSync(inputPath)) {
    console.error('data.json tidak ditemukan:', inputPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, 'utf8');
  const items = JSON.parse(raw);
  if (!Array.isArray(items)) {
    console.error('Format assets/data.json harus array');
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const productsHeaders = [
    'slug',
    'title',
    'subtitle',
    'description',
    'detail_description',
    'badge',
    'price',
    'color',
    'battery',
    'weight',
    'latency',
    'accent',
    'is_active',
  ];

  const productsRows = items.map((it) => ({
    slug: it.id,
    title: it.title || '',
    subtitle: it.subtitle || '',
    description: it.description || '',
    detail_description: it.detail_description || '',
    badge: it.badge || '',
    price: parsePriceToNumeric(it.price),
    color: it.color || '',
    battery: it.battery || '',
    weight: it.weight || '',
    latency: it.latency || '',
    accent: it.accent || '',
    is_active: 'true',
  }));

  const productsCsv = path.join(outDir, 'products.csv');
  writeCsv(productsCsv, productsHeaders, productsRows);

  const stageHeaders = ['product_slug', 'image_url', 'sort_order'];
  const stageRows = items.map((it) => ({
    product_slug: it.id,
    image_url: it.image || '',
    sort_order: 0,
  }));

  const stageCsv = path.join(outDir, 'product_images_stage.csv');
  writeCsv(stageCsv, stageHeaders, stageRows);

  console.log('CSV generated:');
  console.log('-', productsCsv);
  console.log('-', stageCsv);
}

main();
