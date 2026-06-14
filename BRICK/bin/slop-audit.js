#!/usr/bin/env node
(async () => {
  const { hello } = await import('../dist/index.js');
  console.log(hello());
})();
