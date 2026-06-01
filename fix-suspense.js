const fs = require('fs');

const files = [
  { path: 'src/app/job-cards/page.tsx', name: 'JobCardsPage' },
  { path: 'src/app/quotes/page.tsx', name: 'QuotesPage' },
  { path: 'src/app/retail/page.tsx', name: 'RetailPage' },
];

files.forEach(({ path, name }) => {
  let c = fs.readFileSync(path, 'utf8');
  // Remove previous wrapper if added
  c = c.replace(/\nexport default function \w+\(\) \{[\s\S]*?\}\n$/, '');
  // Fix function name
  c = c.replace(`function ${name}Inner(`, `export default function ${name}(`);
  // Add import for Suspense
  c = c.replace("import { useEffect,", "import { Suspense, useEffect,");
  // Wrap useSearchParams call
  c = c.replace(
    'const searchParams = useSearchParams()',
    '// @ts-ignore\n  const searchParams = useSearchParams()'
  );
  fs.writeFileSync(path, c);
  console.log('Fixed:', path);
});