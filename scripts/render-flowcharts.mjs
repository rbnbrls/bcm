/**
 * Render Mermaid flowcharts for all change types as SVG files.
 *
 * Uses Playwright to render Mermaid definitions in a real browser context,
 * then extracts each rendered SVG to save as standalone files.
 *
 * Usage: node scripts/render-flowcharts.mjs
 * Output: public/images/flowcharts/*.svg
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'public', 'images', 'flowcharts');

// ── All change type data (mirrors DEFAULT_CHANGE_TYPE_CONFIGS in lib/db.ts) ──

const changeTypes = [
  {
    name: 'Nieuwe klant',
    slug: 'customer_onboarding',
    flow: [
      { stepOrder: 1, stakeholder: 'Interne administratie', stakeholderId: 'internal_admin', action: 'Aanvraag indienen', leadTime: '1 werkdag', description: 'Stelt klantgegevens, regelingtype en portfolio-informatie op en dient de onboarding-aanvraag in.' },
      { stepOrder: 2, stakeholder: 'Asset service provider', stakeholderId: 'asset_service', action: 'Controleren en valideren', leadTime: '1 werkdag', description: 'Controleert de klantgegevens, regelingtype en asset class, en valideert de aanvraag.' },
      { stepOrder: 3, stakeholder: 'Asset service provider', stakeholderId: 'asset_service', action: 'Inrichten klantomgeving', leadTime: '2 werkdagen', description: 'Richt de klant in met portfolio\'s, benchmarks en rapportages in de systemen.' },
      { stepOrder: 4, stakeholder: 'Interne administratie', stakeholderId: 'internal_admin', action: 'Gereedmelding', leadTime: '—', description: 'Controleert de inrichting en meldt de onboarding gereed.' },
    ],
  },
  {
    name: 'Benchmarkwissel',
    slug: 'benchmark_switch',
    flow: [
      { stepOrder: 1, stakeholder: 'Interne administratie', stakeholderId: 'internal_admin', action: 'Aanvraag indienen', leadTime: '1 werkdag', description: 'Interne administratie stelt de benchmarkwissel op en dient de aanvraag in ter goedkeuring.' },
      { stepOrder: 2, stakeholder: 'Asset service provider', stakeholderId: 'asset_service', action: 'Controleren en accorderen', leadTime: '3 werkdagen', description: 'Asset service provider controleert de aangevraagde wijziging en accordeert deze.' },
      { stepOrder: 3, stakeholder: 'Asset service provider', stakeholderId: 'asset_service', action: 'Uitvoeren benchmarkwissel', leadTime: '2 werkdagen', description: 'Asset service provider voert de benchmarkwissel door in de systemen.' },
      { stepOrder: 4, stakeholder: 'FactSet', stakeholderId: 'factset', action: 'Verwerken en bevestigen', leadTime: '1 werkdag', description: 'FactSet verwerkt de wijziging en stuurt een bevestiging van de verwerking.' },
      { stepOrder: 5, stakeholder: 'Interne administratie', stakeholderId: 'internal_admin', action: 'Gereedmelding', leadTime: '—', description: 'Interne administratie controleert de verwerking en meldt de change gereed.' },
    ],
  },
  {
    name: 'Nieuwe benchmark',
    slug: 'new_benchmark',
    flow: [
      { stepOrder: 1, stakeholder: 'Interne administratie', stakeholderId: 'internal_admin', action: 'Aanvraag indienen', leadTime: '1 werkdag', description: 'Interne administratie stelt de aanvraag voor een nieuwe benchmark op en dient deze in.' },
      { stepOrder: 2, stakeholder: 'Asset service provider', stakeholderId: 'asset_service', action: 'Controleren en accorderen', leadTime: '5 werkdagen', description: 'Asset service provider controleert de benchmarkgegevens en accordeert de toevoeging.' },
      { stepOrder: 3, stakeholder: 'Asset service provider', stakeholderId: 'asset_service', action: 'Toevoegen aan catalogus', leadTime: '10 werkdagen', description: 'Asset service provider voegt de nieuwe benchmark toe aan de benchmarkcatalogus.' },
      { stepOrder: 4, stakeholder: 'Interne administratie', stakeholderId: 'internal_admin', action: 'Gereedmelding', leadTime: '—', description: 'Interne administratie controleert de toevoeging en meldt de change gereed.' },
    ],
  },
  {
    name: 'Tariefwijziging',
    slug: 'fee_change',
    flow: [
      { stepOrder: 1, stakeholder: 'Interne administratie', stakeholderId: 'internal_admin', action: 'Aanvraag indienen', leadTime: '1 werkdag', description: 'Interne administratie stelt de tariefwijziging op en dient de aanvraag in.' },
      { stepOrder: 2, stakeholder: 'Asset service provider', stakeholderId: 'asset_service', action: 'Controleren en accorderen', leadTime: '3 werkdagen', description: 'Asset service provider controleert het nieuwe tarief en accordeert de wijziging.' },
      { stepOrder: 3, stakeholder: 'FactSet', stakeholderId: 'factset', action: 'Verwerken in systeem', leadTime: '3 werkdagen', description: 'FactSet verwerkt het nieuwe tarief in de systemen.' },
      { stepOrder: 4, stakeholder: 'Interne administratie', stakeholderId: 'internal_admin', action: 'Gereedmelding', leadTime: '—', description: 'Interne administratie controleert de verwerking en meldt de change gereed.' },
    ],
  },
  {
    name: 'Mandaatwijziging',
    slug: 'mandate_change',
    flow: [
      { stepOrder: 1, stakeholder: 'Interne administratie', stakeholderId: 'internal_admin', action: 'Aanvraag indienen', leadTime: '1 werkdag', description: 'Interne administratie stelt de mandaatwijziging op en dient de aanvraag in.' },
      { stepOrder: 2, stakeholder: 'Asset service provider', stakeholderId: 'asset_service', action: 'Controleren en accorderen', leadTime: '5 werkdagen', description: 'Asset service provider controleert de nieuwe mandaatvoorwaarden en accordeert de wijziging.' },
      { stepOrder: 3, stakeholder: 'Asset service provider', stakeholderId: 'asset_service', action: 'Uitvoeren mandaatwijziging', leadTime: '5 werkdagen', description: 'Asset service provider voert de mandaatwijziging door in de administratie.' },
      { stepOrder: 4, stakeholder: 'Interne administratie', stakeholderId: 'internal_admin', action: 'Gereedmelding', leadTime: '—', description: 'Interne administratie controleert de verwerking en meldt de change gereed.' },
    ],
  },
  {
    name: 'Custodianwijziging',
    slug: 'custodian_change',
    flow: [
      { stepOrder: 1, stakeholder: 'Interne administratie', stakeholderId: 'internal_admin', action: 'Aanvraag indienen', leadTime: '1 werkdag', description: 'Interne administratie stelt de custodianwijziging op en dient de aanvraag in.' },
      { stepOrder: 2, stakeholder: 'Asset service provider', stakeholderId: 'asset_service', action: 'Controleren en accorderen', leadTime: '5 werkdagen', description: 'Asset service provider controleert de nieuwe custodian en accordeert de wijziging.' },
      { stepOrder: 3, stakeholder: 'Asset service provider', stakeholderId: 'asset_service', action: 'Uitvoeren custodianwijziging', leadTime: '10 werkdagen', description: 'Asset service provider voert de custodianwijziging door in de administratie.' },
      { stepOrder: 4, stakeholder: 'Interne administratie', stakeholderId: 'internal_admin', action: 'Gereedmelding', leadTime: '—', description: 'Interne administratie controleert de verwerking en meldt de change gereed.' },
    ],
  },
  {
    name: 'Herbalanceringsdrempel',
    slug: 'rebalance_trigger',
    flow: [
      { stepOrder: 1, stakeholder: 'Interne administratie', stakeholderId: 'internal_admin', action: 'Aanvraag indienen', leadTime: '1 werkdag', description: 'Interne administratie stelt de herbalanceringsdrempel in en dient de aanvraag in.' },
      { stepOrder: 2, stakeholder: 'Asset service provider', stakeholderId: 'asset_service', action: 'Controleren en accorderen', leadTime: '2 werkdagen', description: 'Asset service provider controleert de drempelwaarde en accordeert de instelling.' },
      { stepOrder: 3, stakeholder: 'Asset service provider', stakeholderId: 'asset_service', action: 'Instellen in systeem', leadTime: '1 werkdag', description: 'Asset service provider stelt de drempel/frequentie in in de systemen.' },
      { stepOrder: 4, stakeholder: 'Interne administratie', stakeholderId: 'internal_admin', action: 'Gereedmelding', leadTime: '—', description: 'Interne administratie controleert de instelling en meldt de change gereed.' },
    ],
  },
];

// ── Mermaid definition generator (matches generateStakeholderFlowMermaid) ──

function escapeMermaid(text) {
  return text.replace(/"/g, "'");
}

function generateMermaid(flow, changeTypeName) {
  const stakeholderSteps = flow.filter(
    (step) => step.stakeholder && step.stakeholder.trim().length > 0 &&
              step.stakeholderId && step.stakeholderId.trim().length > 0
  );

  if (stakeholderSteps.length === 0) {
    return 'flowchart LR\n  A["Geen processtappen beschikbaar"]';
  }

  const lines = [];
  lines.push('flowchart LR');

  // Group by stakeholder
  const stakeholderOrder = [];
  const stakeholderGroups = new Map();
  for (const step of stakeholderSteps) {
    if (!stakeholderGroups.has(step.stakeholder)) {
      stakeholderGroups.set(step.stakeholder, []);
      stakeholderOrder.push(step.stakeholder);
    }
    stakeholderGroups.get(step.stakeholder).push(step);
  }

  const colors = [
    { fill: '#dff4e9', stroke: '#0a513f', text: '#0a513f' },
    { fill: '#e3eaf5', stroke: '#28497c', text: '#28497c' },
    { fill: '#fff3d6', stroke: '#c8950c', text: '#c8950c' },
    { fill: '#f3e8ff', stroke: '#6d28d9', text: '#6d28d9' },
    { fill: '#fce7f3', stroke: '#be185d', text: '#be185d' },
  ];

  stakeholderOrder.forEach((_, idx) => {
    const c = colors[idx % colors.length];
    lines.push(`  classDef stkh-${idx} fill:${c.fill},stroke:${c.stroke},stroke-width:1px,color:${c.text}`);
  });

  const allStepIds = [];

  stakeholderOrder.forEach((stakeholder, idx) => {
    const steps = stakeholderGroups.get(stakeholder);
    const safeLabel = escapeMermaid(stakeholder);

    lines.push(`  subgraph sg${idx}["${safeLabel}"]`);
    lines.push('    direction LR');

    for (const step of steps) {
      const stepId = `S${step.stepOrder}`;
      if (!allStepIds.includes(stepId)) {
        allStepIds.push(stepId);
      }
      const leadHtml = step.leadTime !== '—' && step.leadTime
        ? `<br/><span style="font-size:11px">⏱ ${escapeMermaid(step.leadTime)}</span>`
        : '';
      lines.push(`    ${stepId}["<strong>${step.stepOrder}. ${escapeMermaid(step.action)}</strong>${leadHtml}"]:::stkh-${idx}`);
    }

    lines.push('  end');
  });

  const sortedForArrows = [...stakeholderSteps].sort((a, b) => a.stepOrder - b.stepOrder);
  for (let i = 0; i < sortedForArrows.length - 1; i++) {
    lines.push(`  S${sortedForArrows[i].stepOrder} --> S${sortedForArrows[i + 1].stepOrder}`);
  }

  return lines.join('\n');
}

// ── Generate page with all charts ──

function buildHtml() {
  const charts = changeTypes.map((ct) => {
    const mermaidDef = generateMermaid(ct.flow, ct.name);
    return {
      name: ct.name,
      slug: ct.slug,
      definition: mermaidDef,
    };
  });

  // Generate one chart per page to avoid sizing issues
  return charts.map((chart, idx) => `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<style>
  body { margin: 0; padding: 32px; background: #fbfcfa; font-family: system-ui, sans-serif; }
  .chart-container { max-width: 1200px; margin: 0 auto; }
  h1 { font-size: 16px; font-weight: 700; color: #0a513f; letter-spacing: -.02em; margin: 0 0 24px; }
  .mermaid { display: flex; justify-content: center; }
</style>
</head>
<body>
<div class="chart-container">
  <h1>Procesflow: ${chart.name}</h1>
  <pre class="mermaid">
${chart.definition}
  </pre>
</div>
</body>
</html>`);
}

// ── Render and save ──

async function renderAll() {
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    viewport: { width: 1400, height: 800 },
  });

  const charts = buildHtml();
  let success = 0;

  for (let i = 0; i < charts.length; i++) {
    const ct = changeTypes[i];
    const html = charts[i];
    const slug = ct.slug;
    const svgPath = resolve(OUT_DIR, `${slug}.svg`);
    const pngPath = resolve(OUT_DIR, `${slug}.png`);

    try {
      const page = await context.newPage();

      // Set content and wait for Mermaid to render
      await page.setContent(html, { waitUntil: 'networkidle' });

      // Wait for SVG to appear
      await page.waitForSelector('.mermaid svg', { timeout: 15000 });
      // Give it a moment to finish rendering
      await page.waitForTimeout(500);

      // Get the SVG element dimensions
      const svgBox = await page.evaluate(() => {
        const svg = document.querySelector('.mermaid svg');
        if (!svg) return null;
        const box = svg.getBoundingClientRect();
        return { width: box.width, height: box.height, x: box.x, y: box.y };
      });

      if (!svgBox) {
        console.error(`[${slug}] SVG not found on page`);
        await page.close();
        continue;
      }

      // Extract SVG content
      const svgContent = await page.evaluate(() => {
        const svg = document.querySelector('.mermaid svg');
        return svg ? svg.outerHTML : null;
      });

      if (svgContent) {
        // Save as SVG
        const fullSvg = `<?xml version="1.0" encoding="UTF-8"?>\n${svgContent}`;
        writeFileSync(svgPath, fullSvg, 'utf-8');
        console.log(`[${slug}] SVG saved: ${svgPath}`);
      }

      // Take a precise screenshot of the SVG element
      const pngBuffer = await page.locator('.mermaid svg').screenshot();
      writeFileSync(pngPath, pngBuffer);
      console.log(`[${slug}] PNG saved: ${pngPath} (${(pngBuffer.length / 1024).toFixed(1)} KB)`);

      await page.close();
      success++;
    } catch (err) {
      console.error(`[${slug}] Failed: ${err.message}`);
    }
  }

  await browser.close();
  console.log(`\nDone: ${success}/${changeTypes.length} flowcharts rendered`);
}

renderAll().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
