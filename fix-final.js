const fs = require('fs');

const pages = [
  { file: 'src/app/quotes/page.tsx', name: 'QuotesPage' },
  { file: 'src/app/retail/page.tsx', name: 'RetailPage' },
];

pages.forEach(({ file, name }) => {
  let c = fs.readFileSync(file, 'utf8');
  
  // Find the FIRST occurrence of the main function and everything before first wrapper
  // Remove everything from first "function XInner" or "export default function X" that has "Suspense" after it
  
  // Step 1: Remove all "Inner" references - restore to original names
  c = c.replace(new RegExp(`function ${name}Inner`, 'g'), `function ${name}`);
  
  // Step 2: Remove duplicate export defaults at bottom (keep only first real function)
  // Find position of second "function QuotesPage" or "function RetailPage"  
  const firstPos = c.indexOf(`function ${name}(`);
  const secondPos = c.indexOf(`function ${name}(`, firstPos + 10);
  if (secondPos !== -1) {
    c = c.substring(0, secondPos - 1);
  }
  
  // Step 3: Rename first function to Inner
  c = c.replace(`export default function ${name}(`, `function ${name}Inner(`);
  c = c.replace(`function ${name}(`, `function ${name}Inner(`);
  
  // Step 4: Add clean wrapper at end
  c = c.trimEnd() + `\n\nexport default function ${name}() {\n  return (\n    <Suspense fallback={null}>\n      <${name}Inner />\n    </Suspense>\n  )\n}\n`;
  
  fs.writeFileSync(file, c);
  console.log('Fixed:', file);
});