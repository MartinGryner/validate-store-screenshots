import { appendFile } from 'node:fs/promises';
import { validateDirectory } from './validate.mjs';

const escapeData = value => String(value).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A');
const escapeProperty = value => escapeData(value).replaceAll(':','%3A').replaceAll(',','%2C');
function annotation(kind, message, file) {
  console.log(`::${kind}${file ? ` file=${escapeProperty(file)}` : ''}::${escapeData(message)}`);
}
function booleanInput(name, fallback) {
  const value = process.env[`INPUT_${name}`] ?? fallback;
  if (!['true','false'].includes(value)) throw new Error(`${name} must be true or false.`);
  return value === 'true';
}
async function main() {
try {
  const fail = booleanInput('FAIL-ON-ERROR','true');
  const failReview = booleanInput('FAIL-ON-REVIEW','false');
  const target = process.env.INPUT_TARGET;
  const directory = process.env.INPUT_DIRECTORY;
  if (!target || !directory) throw new Error('Both directory and target are required.');
  const report = await validateDirectory(directory, target, process.env.GITHUB_WORKSPACE || process.cwd());
  for (const error of report.errors) annotation('error',error.message,error.name);
  for (const result of report.results) for (const check of result.checks) {
    if (check.tone !== 'pass') annotation(check.tone === 'fail' ? 'error' : 'warning', `${check.label}: ${check.detail}`,result.name);
  }
  if (report.countCheck.tone !== 'pass') annotation(report.countCheck.tone === 'fail' ? 'error' : 'warning',report.countCheck.detail);
  const summary = `${report.files} files: ${report.failures} failures, ${report.reviews} review items. Target: ${target}.`;
  console.log(summary);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT,`failures=${report.failures}\nreviews=${report.reviews}\nfiles=${report.files}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,`## Store screenshot validation\n\n${summary}\n\nFile-specific details appear in workflow annotations.\n\n[Free browser validator](https://martingruner.com/tools/store-screenshot-validator) · [Optional screenshot design app](https://martingruner.com/projects/screenshot-studio)\n`);
  if ((fail && report.failures > 0) || (failReview && report.reviews > 0)) process.exitCode = 1;
} catch (error) {
  annotation('error',error.message);
  process.exitCode = 1;
}
}
void main();
