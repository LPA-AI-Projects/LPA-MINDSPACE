const fs = require('fs');
let js = fs.readFileSync('public/board_vanilla.js', 'utf-8');

js = js.replace(
  /const response = await fetch\('https:\/\/api\.anthropic\.com\/v1\/messages',[^{]*({[^]*?})\);/m,
  `const response = await fetch('http://localhost:3001/api/generate-board', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemPrompt: systemPrompt,
        userMsg: userMsg
      })
    });`
);

fs.writeFileSync('public/board_vanilla.js', js);
console.log('Updated AI call to use proxy');
