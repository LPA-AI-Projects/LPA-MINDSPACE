const fs = require('fs');
let js = fs.readFileSync('public/board_vanilla.js', 'utf-8');

js = js.replace(
  /localStorage\.setItem\('lpa-mindspace-v1',\s*JSON\.stringify\(({[^]*?})\)\);/g,
  `localStorage.setItem('lpa-mindspace-v1', JSON.stringify($1));
    if (window.supabaseStorageSave) window.supabaseStorageSave($1);`
);

// Also intercept the initial loading
js = js.replace(
  /const raw = localStorage\.getItem\('lpa-mindspace-v1'\);/g,
  `const raw = window.supabaseInitialState || localStorage.getItem('lpa-mindspace-v1');`
);

fs.writeFileSync('public/board_vanilla.js', js);
console.log('Updated board_vanilla.js');
