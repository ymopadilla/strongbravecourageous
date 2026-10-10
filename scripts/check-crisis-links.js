/* Fails the build check if the crisis and counselor links go missing or unreachable.
   Run after a build: node scripts/check-crisis-links.js
   Every page: a 988 phone link AND a link to the 988 website (a phone link does nothing on a laptop).
   Resources: the Find a Counselor link, in a block no tab can hide. */
const fs = require('fs');
const path = require('path');
const dist = path.join(__dirname, '..', 'dist');
const skip = /^(admin|thanks-|404)/;
const problems = [];
const pages = fs.readdirSync(dist).filter(f => f.endsWith('.html') && !skip.test(f));
for (const f of pages) {
  const html = fs.readFileSync(path.join(dist, f), 'utf8');
  if (!html.includes('href="tel:988"')) problems.push(f + ': no 988 phone link');
  if (!html.includes('href="https://988lifeline.org/"')) problems.push(f + ': no link to 988lifeline.org');
  if (!/href="\/resources(\.html)?#professional-help"/.test(html)) problems.push(f + ': no Find a counselor link in the footer');
}
const res = fs.readFileSync(path.join(dist, 'resources.html'), 'utf8');
const block = res.match(/<div[^>]*id="professional-help"[^>]*>/);
if (!block) problems.push('resources.html: #professional-help block is missing');
else if (/\bhidden\b|res-panel/.test(block[0])) problems.push('resources.html: #professional-help is a hidden or tabbed panel');
if (!res.includes('href="https://www.psychologytoday.com/us/therapists"')) problems.push('resources.html: Find a Counselor link is missing');
if (problems.length) { console.error('Crisis link check FAILED:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log('Crisis link check passed on ' + pages.length + ' pages.');
